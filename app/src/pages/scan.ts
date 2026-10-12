// 掃描頁：相機常駐；查詢結果以底部面板滑出，直接對準下一件即可連續掃描
import { handleQuery, updateBanner } from "../app";
import { Scanner, ScannerError, feedback } from "../scanner";
import { createSheet } from "../sheet";
import { state } from "../state";
import { el } from "../ui";
import { renderResultContent } from "./result";

const RESUME_DELAY = 700; // 面板滑出後多久恢復辨識

export function renderScan(root: HTMLElement): () => void {
  // 手動查詢固定在最上方，面板打開時也按得到
  const input = el("input", { id: "scan-query", type: "search", inputmode: "search", autocapitalize: "characters", autocomplete: "off", placeholder: "條碼／商品編號／名稱關鍵字", "aria-label": "手動查詢" }) as HTMLInputElement;
  const searchBtn = el("button", { type: "submit", class: "small" }, "查詢");
  const form = el("form", { class: "row search-top" }, input, searchBtn);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = input.value.trim();
    if (v) {
      handleQuery(v);
      input.blur();
    }
  });

  const video = el("video", { autoplay: true, muted: true, playsinline: true }) as HTMLVideoElement;
  const status = el("div", { class: "scan-status" }, "正在啟動相機…");
  const bannerSlot = el("div", { class: "scan-banner" });
  const wrap = el("div", { class: "scan-wrap" }, video, el("div", { class: "scan-frame" }), status, bannerSlot);
  const msg = el("div", { class: "scan-msg", hidden: true });
  const retryBtn = el("button", { type: "button", class: "secondary", hidden: true }, "重新開啟相機");
  const count = el("p", { class: "muted center" }, state.index ? `商品資料 ${state.index.size.toLocaleString()} 筆` : "尚未下載商品資料，請到「資料」頁同步");

  const refreshBanner = () => {
    bannerSlot.replaceChildren();
    const b = updateBanner();
    if (b) bannerSlot.append(b);
  };
  refreshBanner();
  window.addEventListener("scan:state", refreshBanner);

  // 結果面板
  const sheet = createSheet({
    label: "查詢結果",
    onClose: () => {
      state.sheetOpen = false;
      root.classList.remove("sheet-open");
      status.textContent = "將條碼對準框內";
      scanner.resume();
    },
  });
  const showResult = () => {
    if (!state.lastResult) return;
    const title = renderResultContent(sheet.body, state.lastResult, state.lastQuery);
    sheet.setTitle(title);
    state.sheetOpen = true;
    root.classList.add("sheet-open");
    sheet.open();
    window.setTimeout(() => {
      if (!stopped) scanner.resume();
    }, RESUME_DELAY);
  };
  window.addEventListener("scan:result", showResult);

  root.append(el("h1", { class: "visually-hidden" }, "掃描條碼"), form, wrap, msg, retryBtn, count, sheet.root);

  const scanner = new Scanner(video);
  let stopped = false;

  async function start(): Promise<void> {
    msg.hidden = true;
    retryBtn.hidden = true;
    wrap.hidden = false;
    status.textContent = "正在啟動相機…";
    try {
      await scanner.start((value) => {
        // 同一件商品還在面板上時不重複觸發
        if (state.sheetOpen && value === state.lastQuery) {
          scanner.resume();
          return;
        }
        feedback();
        status.textContent = `讀到：${value}`;
        handleQuery(value);
      });
      status.textContent = "將條碼對準框內";
    } catch (e) {
      wrap.hidden = true;
      // 相機不可用時提示條改放在頁面上，否則會跟著相機一起被隱藏
      bannerSlot.classList.remove("scan-banner");
      root.insertBefore(bannerSlot, form);
      msg.hidden = false;
      msg.textContent = e instanceof ScannerError ? e.message : "相機無法使用，請改用上方手動查詢";
      retryBtn.hidden = false;
    }
  }
  retryBtn.addEventListener("click", () => void start());
  void start();
  if (state.sheetOpen && state.lastResult) showResult();

  // 切到背景時關相機，回到前景再開
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
    window.removeEventListener("scan:result", showResult);
  };
}
