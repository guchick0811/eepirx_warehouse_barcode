import { afterLogin } from "../app";
import { APP_VERSION, CONFIGURED } from "../config";
import { LoginError, login } from "../supabase";
import { el, navigate } from "../ui";

export function renderLogin(root: HTMLElement): void {
  const user = el("input", { type: "text", name: "username", autocomplete: "username", autocapitalize: "none", spellcheck: "false", placeholder: "例如 wang01", required: true }) as HTMLInputElement;
  const pass = el("input", { type: "password", name: "password", autocomplete: "current-password", placeholder: "密碼", required: true }) as HTMLInputElement;
  const err = el("div", { class: "error" });
  const btn = el("button", { type: "submit" }, "登入") as HTMLButtonElement;

  const form = el(
    "form",
    { class: "stack", autocomplete: "on" },
    el("label", {}, "帳號"),
    user,
    el("label", {}, "密碼"),
    pass,
    err,
    btn,
  );
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    err.textContent = "";
    btn.disabled = true;
    btn.textContent = "登入中…";
    try {
      const profile = await login(user.value, pass.value);
      pass.value = "";
      await afterLogin(profile);
      navigate("#/scan");
    } catch (ex) {
      err.textContent = ex instanceof LoginError ? ex.message : "登入失敗，請稍後再試";
      btn.disabled = false;
      btn.textContent = "登入";
    }
  });

  root.append(
    el("div", { class: "login-logo" }, "📦"),
    el("h1", { class: "center" }, "倉儲掃碼查詢"),
    el("p", { class: "muted center" }, "請使用管理者發給您的帳號登入"),
    form,
    el("p", { class: "muted center" }, `版本 ${APP_VERSION}`),
  );
  if (!CONFIGURED) err.textContent = "尚未設定 Supabase anon key（app/.env）";
  setTimeout(() => user.focus(), 50);
}
