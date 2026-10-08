import { state } from "../state";
import { USERNAME_RE, callAdmin, type AppUser } from "../supabase";
import { formatTime } from "../sync";
import { confirmDialog, el, toast } from "../ui";

interface AuditRow {
  id: number;
  actor_username: string | null;
  action: string;
  target_username: string | null;
  at: string;
}

const ACTION_LABEL: Record<string, string> = {
  create: "新增", set_active: "停用／啟用", reset_password: "重設密碼", delete: "刪除",
};

export function renderUsers(root: HTMLElement): void {
  const tableBody = el("tbody");
  const auditBody = el("tbody");

  async function load(): Promise<void> {
    try {
      const users = await callAdmin<AppUser[]>("list");
      tableBody.replaceChildren(...users.map(userRow));
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  async function loadAudit(): Promise<void> {
    try {
      const rows = await callAdmin<AuditRow[]>("list_audit");
      auditBody.replaceChildren(
        ...rows.map((r) =>
          el("tr", {}, el("td", {}, formatTime(r.at)), el("td", {}, r.actor_username ?? "—"), el("td", {}, ACTION_LABEL[r.action] ?? r.action), el("td", {}, r.target_username ?? "—")),
        ),
      );
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  function userRow(u: AppUser): HTMLElement {
    const self = u.id === state.user?.id;
    const toggle = el("button", { type: "button", class: "small secondary", disabled: self }, u.is_active ? "停用" : "啟用");
    const reset = el("button", { type: "button", class: "small secondary" }, "重設密碼");
    const remove = el("button", { type: "button", class: "small danger", disabled: self }, "刪除");

    toggle.addEventListener("click", async () => {
      const next = !u.is_active;
      if (!confirmDialog(`${next ? "啟用" : "停用"}帳號 ${u.username}？${next ? "" : "停用後此人將無法登入與同步資料。"}`)) return;
      await run(() => callAdmin("set_active", { id: u.id, is_active: next }), `${u.username} 已${next ? "啟用" : "停用"}`);
    });
    reset.addEventListener("click", async () => {
      const pw = window.prompt(`輸入 ${u.username} 的新密碼（至少 8 碼）`);
      if (pw === null) return;
      if (pw.length < 8) return toast("密碼至少 8 碼", "error");
      await run(() => callAdmin("reset_password", { id: u.id, password: pw }), `${u.username} 的密碼已重設`);
    });
    remove.addEventListener("click", async () => {
      if (!confirmDialog(`確定刪除帳號 ${u.username}？此操作無法復原。`)) return;
      await run(() => callAdmin("delete", { id: u.id }), `${u.username} 已刪除`);
    });

    return el(
      "tr",
      {},
      el("td", {}, el("div", {}, u.username), el("div", { class: "muted" }, u.display_name || "")),
      el("td", {}, el("span", { class: "tag " + (u.role === "admin" ? "admin" : "") }, u.role === "admin" ? "管理者" : "一般")),
      el("td", {}, el("span", { class: "tag " + (u.is_active ? "on" : "off") }, u.is_active ? "啟用" : "停用")),
      el("td", {}, el("div", { class: "stack" }, toggle, reset, remove)),
    );
  }

  async function run(fn: () => Promise<unknown>, okMsg: string): Promise<void> {
    try {
      await fn();
      toast(okMsg, "ok");
      await Promise.all([load(), loadAudit()]);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  // 新增帳號表單
  const username = el("input", { type: "text", autocapitalize: "none", autocomplete: "off", placeholder: "3～20 碼英數字或底線，例如 wang01" }) as HTMLInputElement;
  const display = el("input", { type: "text", autocomplete: "off", placeholder: "顯示姓名" }) as HTMLInputElement;
  const password = el("input", { type: "text", autocomplete: "new-password", placeholder: "至少 8 碼" }) as HTMLInputElement;
  const role = el("select", {}, el("option", { value: "staff" }, "一般人員"), el("option", { value: "admin" }, "管理者")) as HTMLSelectElement;
  const submit = el("button", { type: "submit" }, "新增帳號") as HTMLButtonElement;
  const form = el("form", { class: "card stack" }, el("h2", { style: "margin-top:0" }, "新增帳號"), el("label", {}, "帳號"), username, el("label", {}, "姓名"), display, el("label", {}, "密碼"), password, el("label", {}, "角色"), role, submit);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const u = username.value.trim().toLowerCase();
    if (!USERNAME_RE.test(u)) return toast("帳號格式：3～20 碼小寫英數字或底線", "error");
    if (password.value.length < 8) return toast("密碼至少 8 碼", "error");
    submit.disabled = true;
    await run(
      () => callAdmin("create", { username: u, display_name: display.value.trim(), password: password.value, role: role.value }),
      `已新增 ${u}，請把帳號與密碼告知本人`,
    );
    submit.disabled = false;
    username.value = display.value = password.value = "";
  });

  root.append(
    el("h1", {}, "人員管理"),
    el("div", { class: "card" }, el("table", {}, el("thead", {}, el("tr", {}, el("th", {}, "帳號"), el("th", {}, "角色"), el("th", {}, "狀態"), el("th", {}, "操作"))), tableBody)),
    el("div", { style: "height:12px" }),
    form,
    el("h2", {}, "最近操作紀錄"),
    el("div", { class: "card" }, el("table", {}, el("thead", {}, el("tr", {}, el("th", {}, "時間"), el("th", {}, "操作者"), el("th", {}, "動作"), el("th", {}, "對象"))), auditBody)),
  );
  void Promise.all([load(), loadAudit()]);
}
