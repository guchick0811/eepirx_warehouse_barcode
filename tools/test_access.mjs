// 權限整合測試：用真實的 Supabase 專案驗證帳號系統與資料存取規則。
// 用法（在專案根目錄，需先 cd app && npm install 並部署 Edge Function）：
//   node tools/test_access.mjs
// 需要 app/.env 的 VITE_SUPABASE_ANON_KEY。預設會用根目錄 .env 的 SUPABASE_SERVICE_ROLE_KEY
// 建立一個暫時的管理者 test_zz_admin 來執行測試，結束後刪除；
// 也可改用既有管理者：set ADMIN_USER=admin / set ADMIN_PASSWORD=xxxx。
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

// 套件裝在 app/node_modules，從那裡解析
const { createClient } = createRequire(new URL("../app/package.json", import.meta.url))("@supabase/supabase-js");
import { createInterface } from "node:readline/promises";

const SUPABASE_URL = "https://bniocopeeizpsxpyuwnb.supabase.co";
const EMAIL_DOMAIN = "scan.local";
const TEST_USER = "test_zz01";
const TEST_PASSWORD = "Test-" + Math.random().toString(36).slice(2, 10) + "x";

function loadAnonKey() {
  if (process.env.VITE_SUPABASE_ANON_KEY) return process.env.VITE_SUPABASE_ANON_KEY;
  for (const p of ["./.env", "../app/.env", "./app/.env"]) {
    try {
      const m = readFileSync(p, "utf8").match(/^VITE_SUPABASE_ANON_KEY=(.+)$/m);
      if (m) return m[1].trim();
    } catch { /* 下一個 */ }
  }
  throw new Error("找不到 VITE_SUPABASE_ANON_KEY");
}

function loadServiceKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY;
  for (const p of ["./.env", "../.env"]) {
    try {
      const m = readFileSync(p, "utf8").match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m);
      if (m && m[1].trim()) return m[1].trim();
    } catch { /* 下一個 */ }
  }
  return "";
}

const ANON_KEY = loadAnonKey();
const TEMP_ADMIN = "test_zz_admin";

/** 用 service role 建立暫時管理者（測試完刪除） */
async function bootstrapTempAdmin(serviceKey) {
  const svc = createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  // 清掉上次殘留（包含只建了 Auth 帳號、沒寫進 app_users 的情況）
  const { data: listed } = await svc.auth.admin.listUsers({ perPage: 1000 });
  for (const u of listed?.users ?? []) {
    if (u.email === `${TEMP_ADMIN}@${EMAIL_DOMAIN}`) await svc.auth.admin.deleteUser(u.id);
  }
  const password = "Adm-" + Math.random().toString(36).slice(2, 12) + "x";
  const { data, error } = await svc.auth.admin.createUser({ email: `${TEMP_ADMIN}@${EMAIL_DOMAIN}`, password, email_confirm: true });
  if (error) throw new Error("建立暫時管理者失敗：" + error.message);
  const { error: insErr } = await svc.from("app_users").insert({ id: data.user.id, username: TEMP_ADMIN, display_name: "測試管理者", role: "admin", is_active: true });
  if (insErr) {
    await svc.auth.admin.deleteUser(data.user.id);
    throw new Error("寫入 app_users 失敗：" + insErr.message);
  }
  return { username: TEMP_ADMIN, password, remove: () => svc.auth.admin.deleteUser(data.user.id) };
}
const client = () => createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

let failures = 0;
function check(label, ok, extra = "") {
  console.log(`  ${ok ? "OK  " : "FAIL"} ${label}${extra ? "：" + extra : ""}`);
  if (!ok) failures++;
}

async function invoke(sb, action, payload = {}) {
  const { data, error } = await sb.functions.invoke("admin-users", { body: { action, ...payload } });
  if (error) {
    let message = error.message;
    let status = error.context?.status ?? 0;
    try { message = (await error.context.json()).error ?? message; } catch { /* ignore */ }
    return { status, error: message };
  }
  return { status: 200, data };
}

async function login(username, password) {
  const sb = client();
  const { data, error } = await sb.auth.signInWithPassword({ email: `${username}@${EMAIL_DOMAIN}`, password });
  if (error) return { sb, error };
  return { sb, session: data.session };
}

async function main() {
  let adminUser = process.env.ADMIN_USER;
  let adminPw = process.env.ADMIN_PASSWORD;
  let temp = null;
  if (!adminPw) {
    const serviceKey = loadServiceKey();
    if (serviceKey) {
      temp = await bootstrapTempAdmin(serviceKey);
      adminUser = temp.username;
      adminPw = temp.password;
      console.log(`0. 已用 service role 建立暫時管理者 ${TEMP_ADMIN}（測試後刪除）`);
    } else {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      adminUser = adminUser || (await rl.question("管理者帳號：")).trim();
      adminPw = await rl.question("管理者密碼：");
      rl.close();
    }
  }

  console.log("1. 未登入（只有 anon key）");
  const anon = client();
  const r1 = await anon.rpc("get_data_version");
  check("anon 呼叫 get_data_version 被拒", !!r1.error, r1.error?.code);
  const r1b = await anon.from("app_users").select("*");
  check("anon 讀 app_users 被拒", !!r1b.error || (r1b.data ?? []).length === 0, r1b.error?.code ?? "0 筆");
  const r1c = await invoke(anon, "list");
  check("anon 呼叫 admin-users 被拒 401", r1c.status === 401, `${r1c.status} ${r1c.error ?? ""}`);

  console.log("2. 管理者登入");
  const adminLogin = await login(adminUser, adminPw);
  check("管理者登入", !!adminLogin.session, adminLogin.error?.message);
  if (!adminLogin.session) return;
  const admin = adminLogin.sb;
  const ver = await admin.rpc("get_data_version");
  check("管理者取得資料版本", !ver.error && !!ver.data?.synced_at, JSON.stringify(ver.data ?? ver.error));

  // 先清掉上次殘留的測試帳號
  const list0 = await invoke(admin, "list");
  check("管理者列出帳號", list0.status === 200, list0.error);
  const stale = (list0.data ?? []).find((u) => u.username === TEST_USER);
  if (stale) await invoke(admin, "delete", { id: stale.id });

  console.log("3. 管理者建立測試帳號");
  const created = await invoke(admin, "create", { username: TEST_USER, display_name: "測試", password: TEST_PASSWORD, role: "staff" });
  check("建立 " + TEST_USER, created.status === 200, created.error);
  const bad = await invoke(admin, "create", { username: "BAD NAME", password: "short", role: "staff" });
  check("不合法帳號／密碼被拒 400", bad.status === 400, `${bad.status} ${bad.error ?? ""}`);

  console.log("4. 一般人員登入與資料存取");
  const staffLogin = await login(TEST_USER, TEST_PASSWORD);
  check("測試帳號登入", !!staffLogin.session, staffLogin.error?.message);
  const staff = staffLogin.sb;
  const t0 = Date.now();
  const prod = await staff.rpc("get_scan_products");
  const n = prod.data?.products?.length ?? 0;
  check("一般人員取得商品資料", !prod.error && n > 10000, `${n.toLocaleString()} 筆，${((Date.now() - t0) / 1000).toFixed(1)} 秒`);
  const keys = Object.keys(prod.data?.products?.[0] ?? {}).sort();
  check("商品欄位只有 11+1 個縮寫欄", keys.join(",") === "b,b2,b3,c,d,e,e2,l,n,pb,q,u", keys.join(","));
  const sample = prod.data?.products?.find((p) => p.c === "0000008");
  check("編號 0000008 的 HQ 儲位為 7B0502", sample?.l === "7B0502", JSON.stringify(sample));
  const own = await staff.from("app_users").select("username, role");
  check("一般人員只看得到自己一列", !own.error && own.data?.length === 1 && own.data[0].username === TEST_USER, JSON.stringify(own.data ?? own.error));
  const esc = await staff.from("app_users").update({ role: "admin" }).eq("username", TEST_USER).select();
  check("一般人員不能改自己的角色", !!esc.error || (esc.data ?? []).length === 0, esc.error?.code ?? "0 列被改");
  const forbidden = await invoke(staff, "create", { username: "zz_hacker", password: "Password123", role: "admin" });
  check("一般人員呼叫 admin-users 被拒 403", forbidden.status === 403, `${forbidden.status} ${forbidden.error ?? ""}`);
  const erp = await staff.from("product_data").select("*").limit(1);
  check("一般人員不能直接讀 erp 資料表", !!erp.error, erp.error?.code);

  console.log("5. 停用後");
  const staffId = created.data?.id;
  const off = await invoke(admin, "set_active", { id: staffId, is_active: false });
  check("停用測試帳號", off.status === 200, off.error);
  const afterOff = await staff.rpc("get_scan_products");
  check("停用後既有 session 取資料被拒", !!afterOff.error, afterOff.error?.code);
  const reLogin = await login(TEST_USER, TEST_PASSWORD);
  check("停用後無法登入", !reLogin.session, reLogin.error?.message);
  const on = await invoke(admin, "set_active", { id: staffId, is_active: true });
  check("重新啟用", on.status === 200, on.error);
  const reLogin2 = await login(TEST_USER, TEST_PASSWORD);
  check("啟用後可登入", !!reLogin2.session, reLogin2.error?.message);

  console.log("6. 重設密碼與刪除");
  const newPw = TEST_PASSWORD + "N";
  const reset = await invoke(admin, "reset_password", { id: staffId, password: newPw });
  check("重設密碼", reset.status === 200, reset.error);
  check("舊密碼登入失敗", !(await login(TEST_USER, TEST_PASSWORD)).session);
  check("新密碼登入成功", !!(await login(TEST_USER, newPw)).session);
  const selfDel = await invoke(admin, "delete", { id: adminLogin.session.user.id });
  check("管理者不能刪除自己 400", selfDel.status === 400, `${selfDel.status} ${selfDel.error ?? ""}`);
  const del = await invoke(admin, "delete", { id: staffId });
  check("刪除測試帳號", del.status === 200, del.error);
  check("刪除後無法登入", !(await login(TEST_USER, newPw)).session);

  console.log("7. 稽核紀錄");
  const auditRes = await invoke(admin, "list_audit");
  const mine = (auditRes.data ?? []).filter((r) => r.target_username === TEST_USER).map((r) => r.action);
  check("稽核含 create/set_active/reset_password/delete", ["create", "set_active", "reset_password", "delete"].every((a) => mine.includes(a)), mine.join(","));

  if (temp) {
    await temp.remove();
    check("暫時管理者已刪除", !(await login(temp.username, temp.password)).session);
  }
  console.log(failures ? `\n${failures} 項失敗` : "\n全部通過");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
