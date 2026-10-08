import { handleQuery, updateBanner } from "../app";
import { Scanner, ScannerError, feedback } from "../scanner";
import { state } from "../state";
import { el, navigate } from "../ui";

export function renderScan(root: HTMLElement): () => void {
  const video = el("video", { autoplay: true, muted: true, playsinline: true }) as HTMLVideoElement;
  const status = el("div", { class: "scan-status" }, "正在啟動相機…");
  const wrap = el("div", { class: "scan-wrap" }, video, el("div", { class: "scan-frame" }), status);
  const msg = el("div", { class: "scan-msg", hidden: true });

  const input = el("input", { type: "search", inputmode: "search", autocapitalize: "characters", autocomplete: "off", placeholder: "輸入條碼／商品編號／名稱關鍵字" }) as HTMLInputElement;
  const searchBtn = el("button", { type: "submit", class: "small" }, "查詢");
  const form = el("form", { class: "row" }, input, searchBtn);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = input.value.trim();
    if (v) handleQuery(v);
  });

  const bannerSlot = el("div");
  const refreshBanner = () => {
    bannerSlot.replaceChildren();
    const b = updateBanner();
    if (b) bannerSlot.append(b);
  };
  refreshBanner();
  window.addEventListener("scan:state", refreshBanner);

  const retryBtn = el("button", { type: "button", class: "secondary", hidden: true }, "重新開啟相機");

  root.append(
    bannerSlot,
    el("h1", {}, "掃描條碼"),
    wrap,
    msg,
    retryBtn,
    el("h2", {}, "手動查詢"),
    form,
    el("p", { class: "muted" }, state.index ? `商品資料 ${state.index.size.toLocaleString()} 筆` : "尚未下載商品資料，請到「資料」頁同步"),
  );

  const scanner = new Scanner(video);
  let stopped = false;

  async function start(): Promise<void> {
    msg.hidden = true;
    retryBtn.hidden = true;
    wrap.hidden = false;
    status.textContent = "正在啟動相機…";
    try {
      await scanner.start((value) => {
        feedback();
        status.textContent = `讀到：${value}`;
        setTimeout(() => {
          if (!stopped) handleQuery(value);
        }, 150);
      });
      status.textContent = "將條碼對準框內";
    } catch (e) {
      wrap.hidden = true;
      msg.hidden = false;
      msg.textContent = e instanceof ScannerError ? e.message : "相機無法使用，請改用手動查詢";
      retryBtn.hidden = false;
    }
  }
  retryBtn.addEventListener("click", () => void start());
  void start();

  // 離開頁面或切到背景時關相機，回到前景再開
  const onVisibility = () => {
    if (document.hidden) scanner.stop();
    else if (!stopped && location.hash === "#/scan") void start();
  };
  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    stopped = true;
    scanner.stop();
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("scan:state", refreshBanner);
  };
}

export function backToScan(): void {
  navigate("#/scan");
}
