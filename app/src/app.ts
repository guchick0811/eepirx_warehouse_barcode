// 跨頁共用的動作：登入後載入資料、檢查更新、同步、登出、查詢
import { loadBundle, needsUpdate } from "./db";
import { resetState, setBundle, state } from "./state";
import { logout, type AppUser } from "./supabase";
import { SyncError, downloadProducts, fetchRemoteVersion } from "./sync";
import { el, navigate, toast } from "./ui";

export async function loadLocalData(): Promise<void> {
  setBundle(await loadBundle());
}

/** 有網路時向伺服器查最新版本，更新 state.updateAvailable */
export async function checkForUpdates(silent = true): Promise<boolean> {
  if (!navigator.onLine) {
    if (!silent) toast("目前離線，無法檢查更新");
    return false;
  }
  try {
    state.remoteVersion = await fetchRemoteVersion();
    state.updateAvailable = needsUpdate(state.bundle?.version ?? null, state.remoteVersion);
    if (!silent) toast(state.updateAvailable ? "有新的商品資料可下載" : "已是最新資料", state.updateAvailable ? "info" : "ok");
    return state.updateAvailable;
  } catch (e) {
    if (e instanceof SyncError && e.kind === "inactive") await forceLogout(e.message);
    else if (!silent) toast((e as Error).message || "檢查更新失敗", "error");
    return false;
  }
}

/** 下載全部商品並存入手機 */
export async function syncNow(): Promise<boolean> {
  if (!navigator.onLine) {
    toast("目前離線，無法同步", "error");
    return false;
  }
  try {
    const bundle = await downloadProducts();
    setBundle(bundle);
    state.remoteVersion = bundle.version;
    state.updateAvailable = false;
    toast(`同步完成，共 ${bundle.products.length.toLocaleString()} 筆商品`, "ok");
    return true;
  } catch (e) {
    if (e instanceof SyncError && e.kind === "inactive") await forceLogout(e.message);
    else toast((e as Error).message || "同步失敗", "error");
    return false;
  }
}

export async function afterLogin(user: AppUser): Promise<void> {
  state.user = user;
  await loadLocalData();
  if (!state.bundle) {
    toast("第一次使用，正在下載商品資料…");
    await syncNow();
  } else {
    void checkForUpdates(true).then(() => window.dispatchEvent(new Event("scan:state")));
  }
}

export async function doLogout(): Promise<void> {
  await logout();
  resetState();
  navigate("#/login");
}

export async function forceLogout(message: string): Promise<void> {
  await doLogout();
  toast(message, "error");
}

/** 掃描或手動輸入後的查詢 → 存入 state 並前往結果頁 */
export function handleQuery(input: string): void {
  if (!state.index) {
    toast("尚未下載商品資料，請先同步", "error");
    navigate("#/manage");
    return;
  }
  const result = state.index.find(input);
  state.lastQuery = input.trim();
  state.lastResult = result;
  state.selected = result.kind === "exact" && result.items.length === 1 ? result.items[0] : null;
  navigate("#/result");
}

/** 有新資料時顯示的提示條 */
export function updateBanner(): HTMLElement | null {
  if (!state.updateAvailable) return null;
  const btn = el("button", { type: "button" }, "立即更新");
  const banner = el("div", { class: "banner" }, el("span", {}, "有新的商品資料"), btn);
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.textContent = "下載中…";
    const ok = await syncNow();
    if (ok) banner.remove();
    else {
      btn.disabled = false;
      btn.textContent = "立即更新";
    }
    window.dispatchEvent(new Event("scan:state"));
  });
  return banner;
}
