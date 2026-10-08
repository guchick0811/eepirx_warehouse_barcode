import { checkForUpdates, doLogout, syncNow, updateBanner } from "../app";
import { APP_VERSION } from "../config";
import { state } from "../state";
import { formatTime } from "../sync";
import { confirmDialog, el } from "../ui";

function kv(label: string, value: string): HTMLElement {
  return el("div", { class: "kv" }, el("span", {}, label), el("span", {}, value));
}

export function renderManage(root: HTMLElement): () => void {
  const bannerSlot = el("div");
  const info = el("div", { class: "card" });
  const checkBtn = el("button", { type: "button", class: "secondary" }, "檢查更新") as HTMLButtonElement;
  const syncBtn = el("button", { type: "button" }, "立即同步") as HTMLButtonElement;
  const logoutBtn = el("button", { type: "button", class: "danger" }, "登出並清除手機內資料");

  const lastVerified = Number(localStorage.getItem("scan.lastVerifiedAt")) || null;

  const refresh = () => {
    bannerSlot.replaceChildren();
    const b = updateBanner();
    if (b) bannerSlot.append(b);
    const local = state.bundle;
    info.replaceChildren(
      el("h2", { style: "margin-top:0" }, "手機內的商品資料"),
      kv("資料版本（伺服器同步時間）", formatTime(local?.version?.synced_at)),
      kv("下載到手機的時間", formatTime(local?.downloadedAt)),
      kv("商品筆數", local ? local.products.length.toLocaleString() : "尚未下載"),
      el("h2", {}, "雲端最新版本"),
      kv("最新同步時間", state.remoteVersion ? formatTime(state.remoteVersion.synced_at) : "尚未檢查"),
      kv("狀態", !state.remoteVersion ? "—" : state.updateAvailable ? "有新資料可下載" : "已是最新"),
      el("h2", {}, "帳號"),
      kv("登入者", state.user ? `${state.user.display_name || state.user.username}（${state.user.username}）` : "—"),
      kv("角色", state.user?.role === "admin" ? "管理者" : "一般"),
      kv("最後連線驗證", lastVerified ? formatTime(new Date(lastVerified).toISOString()) : "—"),
      kv("APP 版本", APP_VERSION),
      kv("網路", navigator.onLine ? "連線中" : "離線"),
    );
  };
  refresh();
  window.addEventListener("scan:state", refresh);

  checkBtn.addEventListener("click", async () => {
    checkBtn.disabled = true;
    await checkForUpdates(false);
    checkBtn.disabled = false;
    refresh();
  });
  syncBtn.addEventListener("click", async () => {
    syncBtn.disabled = true;
    syncBtn.textContent = "下載中…";
    await syncNow();
    syncBtn.disabled = false;
    syncBtn.textContent = "立即同步";
    refresh();
  });
  logoutBtn.addEventListener("click", async () => {
    if (confirmDialog("登出後手機內的商品資料會一併清除，下次登入需重新下載。確定登出？")) await doLogout();
  });

  root.append(
    bannerSlot,
    el("h1", {}, "資料管理"),
    info,
    el("div", { class: "stack", style: "margin-top:12px" }, el("div", { class: "row" }, checkBtn, syncBtn), logoutBtn),
    el("p", { class: "muted" }, "商品資料每天凌晨由 ERP 自動同步到雲端；APP 開啟時若偵測到新版本會自動提示。"),
  );

  return () => window.removeEventListener("scan:state", refresh);
}
