// 人員管理 Edge Function：新增／停用／啟用／刪除／重設密碼／列表／稽核紀錄
// 安全設計：
// 1. 不信任閘道的 JWT 檢查（anon key 本身也是合法 JWT），一律用 auth.getUser(token) 向 Auth 伺服器驗證
// 2. 再用 service role 查 app_users，呼叫者必須 role='admin' 且 is_active
// 3. 停用＝Auth 層 ban（登入與 refresh 都被拒）＋ app_users.is_active=false；刪除＝deleteUser
// 4. 所有寫入動作寫 app_user_audit；CORS 只允許白名單來源
import { createClient } from "npm:@supabase/supabase-js@2.117.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "http://localhost:5173").split(",").map((s) => s.trim());
const EMAIL_DOMAIN = "scan.local";
const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
const BAN_FOREVER = "876000h"; // 100 年

type Role = "admin" | "staff";
interface Caller { id: string; username: string; role: Role; is_active: boolean }

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

function cors(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function authenticate(req: Request): Promise<Caller> {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) throw new HttpError(401, "未登入");
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "登入已失效");
  const { data: profile, error: pErr } = await admin
    .from("app_users").select("id, username, role, is_active").eq("id", data.user.id).maybeSingle();
  if (pErr) throw new HttpError(500, "讀取帳號失敗");
  if (!profile || !profile.is_active) throw new HttpError(403, "帳號未啟用");
  if (profile.role !== "admin") throw new HttpError(403, "只有管理者可以執行此操作");
  return profile as Caller;
}

async function audit(caller: Caller, action: string, target: string | null, detail: Record<string, unknown> = {}): Promise<void> {
  await admin.from("app_user_audit").insert({ actor_id: caller.id, actor_username: caller.username, action, target_username: target, detail });
}

async function targetUser(id: unknown): Promise<{ id: string; username: string; is_active: boolean; role: Role }> {
  if (typeof id !== "string" || !id) throw new HttpError(400, "缺少帳號 id");
  const { data, error } = await admin.from("app_users").select("id, username, is_active, role").eq("id", id).maybeSingle();
  if (error) throw new HttpError(500, "讀取帳號失敗");
  if (!data) throw new HttpError(404, "找不到此帳號");
  return data as { id: string; username: string; is_active: boolean; role: Role };
}

function requirePassword(pw: unknown): string {
  if (typeof pw !== "string" || pw.length < 8 || pw.length > 72) throw new HttpError(400, "密碼需 8～72 碼");
  return pw;
}

async function handle(caller: Caller, body: Record<string, unknown>): Promise<unknown> {
  switch (body.action) {
    case "list": {
      const { data, error } = await admin.from("app_users")
        .select("id, username, display_name, role, is_active, created_at").order("username");
      if (error) throw new HttpError(500, error.message);
      return data;
    }
    case "list_audit": {
      const { data, error } = await admin.from("app_user_audit")
        .select("id, actor_username, action, target_username, at").order("id", { ascending: false }).limit(100);
      if (error) throw new HttpError(500, error.message);
      return data;
    }
    case "create": {
      const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
      if (!USERNAME_RE.test(username)) throw new HttpError(400, "帳號格式：3～20 碼小寫英數字或底線");
      const password = requirePassword(body.password);
      const role: Role = body.role === "admin" ? "admin" : "staff";
      const display_name = typeof body.display_name === "string" ? body.display_name.trim().slice(0, 50) : "";
      const { data: exists } = await admin.from("app_users").select("id").eq("username", username).maybeSingle();
      if (exists) throw new HttpError(409, "帳號已存在");
      const { data: created, error } = await admin.auth.admin.createUser({
        email: `${username}@${EMAIL_DOMAIN}`, password, email_confirm: true, user_metadata: { username },
      });
      if (error || !created.user) throw new HttpError(400, error?.message ?? "建立帳號失敗");
      const { error: insErr } = await admin.from("app_users").insert({ id: created.user.id, username, display_name, role, is_active: true });
      if (insErr) {
        await admin.auth.admin.deleteUser(created.user.id); // 回復，避免留下沒有 profile 的帳號
        throw new HttpError(500, "建立帳號資料失敗：" + insErr.message);
      }
      await audit(caller, "create", username, { role });
      return { id: created.user.id, username };
    }
    case "set_active": {
      const t = await targetUser(body.id);
      if (t.id === caller.id) throw new HttpError(400, "不能停用自己的帳號");
      const active = body.is_active === true;
      const { error } = await admin.auth.admin.updateUserById(t.id, { ban_duration: active ? "none" : BAN_FOREVER });
      if (error) throw new HttpError(500, error.message);
      const { error: upErr } = await admin.from("app_users").update({ is_active: active, updated_at: new Date().toISOString() }).eq("id", t.id);
      if (upErr) throw new HttpError(500, upErr.message);
      await audit(caller, "set_active", t.username, { is_active: active });
      return { ok: true };
    }
    case "reset_password": {
      const t = await targetUser(body.id);
      const password = requirePassword(body.password);
      const { error } = await admin.auth.admin.updateUserById(t.id, { password });
      if (error) throw new HttpError(500, error.message);
      await audit(caller, "reset_password", t.username);
      return { ok: true };
    }
    case "delete": {
      const t = await targetUser(body.id);
      if (t.id === caller.id) throw new HttpError(400, "不能刪除自己的帳號");
      const { error } = await admin.auth.admin.deleteUser(t.id); // app_users 由外鍵 cascade 一併刪除
      if (error) throw new HttpError(500, error.message);
      await audit(caller, "delete", t.username, { role: t.role });
      return { ok: true };
    }
    default:
      throw new HttpError(400, "未知的操作");
  }
}

Deno.serve(async (req) => {
  const headers = cors(req.headers.get("Origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405, headers);
  try {
    const caller = await authenticate(req);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const result = await handle(caller, body);
    return json(result, 200, headers);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status, headers);
    console.error(e);
    return json({ error: "伺服器錯誤" }, 500, headers);
  }
});
