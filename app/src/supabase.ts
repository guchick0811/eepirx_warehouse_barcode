// Supabase 連線、登入／登出、session 驗證（含離線寬限）
import { createClient, isAuthApiError, isAuthRetryableFetchError } from "@supabase/supabase-js";
import { ACCOUNT_EMAIL_DOMAIN, SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";
import { clearBundle } from "./db";
import { decideSession, type SessionDecision, type VerifyOutcome } from "./session";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY || "anon-key-not-configured", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

export interface AppUser {
  id: string;
  username: string;
  display_name: string;
  role: "admin" | "staff";
  is_active: boolean;
}

const LS_USER = "scan.user";
const LS_VERIFIED = "scan.lastVerifiedAt";

export const usernameToEmail = (username: string): string =>
  `${username.trim().toLowerCase()}@${ACCOUNT_EMAIL_DOMAIN}`;

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export function cachedUser(): AppUser | null {
  try {
    const raw = localStorage.getItem(LS_USER);
    return raw ? (JSON.parse(raw) as AppUser) : null;
  } catch {
    return null;
  }
}

function lastVerifiedAt(): number | null {
  const v = Number(localStorage.getItem(LS_VERIFIED));
  return v > 0 ? v : null;
}

function rememberVerified(user: AppUser): void {
  localStorage.setItem(LS_USER, JSON.stringify(user));
  localStorage.setItem(LS_VERIFIED, String(Date.now()));
}

/** 讀自己的 app_users 列（RLS 只允許本人） */
async function fetchOwnProfile(userId: string): Promise<AppUser | null> {
  const { data, error } = await supabase
    .from("app_users")
    .select("id, username, display_name, role, is_active")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data as AppUser | null) ?? null;
}

export class LoginError extends Error {}

export async function login(username: string, password: string): Promise<AppUser> {
  const u = username.trim().toLowerCase();
  if (!USERNAME_RE.test(u) || !password) throw new LoginError("帳號或密碼錯誤");
  const { data, error } = await supabase.auth.signInWithPassword({ email: usernameToEmail(u), password });
  if (error || !data.user) {
    if (error && isAuthRetryableFetchError(error)) throw new LoginError("無法連線到伺服器，請確認網路");
    throw new LoginError("帳號或密碼錯誤");
  }
  let profile: AppUser | null = null;
  try {
    profile = await fetchOwnProfile(data.user.id);
  } catch {
    await supabase.auth.signOut({ scope: "local" });
    throw new LoginError("無法讀取帳號資料，請稍後再試");
  }
  if (!profile || !profile.is_active) {
    await supabase.auth.signOut({ scope: "local" });
    throw new LoginError("此帳號未啟用，請洽管理者");
  }
  rememberVerified(profile);
  return profile;
}

/** 向伺服器驗證目前 session 是否仍有效（帳號未被刪除／停用） */
export async function verifyOnline(): Promise<VerifyOutcome> {
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    if (isAuthRetryableFetchError(error)) return "network_error";
    if (isAuthApiError(error)) return "invalid";
    return "network_error";
  }
  if (!data.user) return "invalid";
  try {
    const profile = await fetchOwnProfile(data.user.id);
    if (!profile || !profile.is_active) return "invalid";
    rememberVerified(profile);
    return "valid";
  } catch (e) {
    const code = (e as { code?: string }).code ?? "";
    // 42501 = 權限被拒（帳號被停用或移除）；其他視為網路問題
    return code === "42501" || code === "PGRST301" ? "invalid" : "network_error";
  }
}

/** 啟動時決定：可用 / 回登入頁 / 清除資料後回登入頁 */
export async function resolveSession(): Promise<{ decision: SessionDecision; user: AppUser | null }> {
  const { data } = await supabase.auth.getSession();
  const hasSession = !!data.session;
  const online = navigator.onLine;
  const verify = hasSession && online ? await verifyOnline() : null;
  const decision = decideSession({ hasSession, online, verify, lastVerifiedAt: lastVerifiedAt(), now: Date.now() });
  if (decision === "wipe") await logout();
  return { decision, user: decision === "ok" ? cachedUser() : null };
}

/** 登出並清除手機內所有資料 */
export async function logout(): Promise<void> {
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    /* 離線時 signOut 可能失敗，照樣清本機 */
  }
  localStorage.removeItem(LS_USER);
  localStorage.removeItem(LS_VERIFIED);
  await clearBundle();
}

/** 呼叫人員管理 Edge Function（只有管理者會成功） */
export async function callAdmin<T = unknown>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("admin-users", { body: { action, ...payload } });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    let message = error.message;
    if (ctx && typeof ctx.json === "function") {
      try {
        const body = (await ctx.json()) as { error?: string };
        if (body?.error) message = body.error;
      } catch {
        /* 沒有 JSON 內容就用預設訊息 */
      }
    }
    throw new Error(message);
  }
  return data as T;
}
