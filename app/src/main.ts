import "./style.css";
import { registerSW } from "virtual:pwa-register";
import { checkForUpdates, loadLocalData, syncNow } from "./app";
import { renderHelp } from "./pages/help";
import { renderLogin } from "./pages/login";
import { renderManage } from "./pages/manage";
import { renderScan } from "./pages/scan";
import { renderUsers } from "./pages/users";
import { state } from "./state";
import { resolveSession } from "./supabase";
import { icon } from "./icons";
import { clear, el, toast } from "./ui";

type Cleanup = (() => void) | void;
type Page = { render: (root: HTMLElement) => Cleanup | Promise<Cleanup>; auth: boolean; admin?: boolean; nav?: boolean };

const routes: Record<string, Page> = {
  "#/login": { render: renderLogin, auth: false, nav: false },
  "#/scan": { render: renderScan, auth: true, nav: true },
  "#/manage": { render: renderManage, auth: true, nav: true },
  "#/users": { render: renderUsers, auth: true, admin: true, nav: true },
  "#/help": { render: renderHelp, auth: true, nav: true },
};

const root = document.getElementById("app")!;
let cleanup: Cleanup = undefined;

function navBar(current: string): HTMLElement {
  const tabs: Array<[string, "camera" | "database" | "users" | "help", string]> = [
    ["#/scan", "camera", "掃描"],
    ["#/manage", "database", "資料"],
  ];
  if (state.user?.role === "admin") tabs.push(["#/users", "users", "人員"]);
  tabs.push(["#/help", "help", "說明"]);
  return el(
    "nav",
    { class: "tabs", "aria-label": "主選單" },
    ...tabs.map(([href, ico, label]) =>
      el("a", { href, class: href === current ? "active" : "", "aria-current": href === current ? "page" : undefined }, el("span", { class: "ico" }, icon(ico, 24)), el("span", {}, label)),
    ),
  );
}

async function route(): Promise<void> {
  let hash = location.hash || "#/scan";
  let page = routes[hash];
  if (!page) {
    hash = "#/scan";
    page = routes[hash];
  }
  if (page.auth && !state.user) {
    location.hash = "#/login";
    return;
  }
  if (!page.auth && state.user) {
    location.hash = "#/scan";
    return;
  }
  if (page.admin && state.user?.role !== "admin") {
    location.hash = "#/scan";
    return;
  }
  if (typeof cleanup === "function") cleanup();
  cleanup = undefined;
  clear(root);
  const main = el("main", { class: page.nav ? "page" : "page no-nav" });
  root.append(main);
  if (page.nav) root.append(navBar(hash));
  cleanup = await page.render(main);
  window.scrollTo(0, 0);
}

async function boot(): Promise<void> {
  registerSW({ immediate: true });
  const { decision, user } = await resolveSession();
  if (decision === "ok" && user) {
    state.user = user;
    await loadLocalData();
  } else if (decision === "wipe") {
    toast("登入已失效，請重新登入", "error");
  }
  window.addEventListener("hashchange", () => void route());
  await route();

  if (state.user) {
    if (!state.bundle && navigator.onLine) {
      toast("正在下載商品資料…");
      await syncNow();
      window.dispatchEvent(new Event("scan:state"));
    } else if (state.bundle) {
      await checkForUpdates(true);
      window.dispatchEvent(new Event("scan:state"));
    }
  }
  window.addEventListener("online", () => {
    if (state.user) void checkForUpdates(true).then(() => window.dispatchEvent(new Event("scan:state")));
  });
}

void boot();
