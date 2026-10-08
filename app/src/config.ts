// Supabase 專案連線設定。anon key 是設計上公開的金鑰：它本身讀不到任何資料，
// 所有資料都要經過登入（RLS 與 SECURITY DEFINER 函式檢查）。
export const SUPABASE_URL = "https://bniocopeeizpsxpyuwnb.supabase.co";
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";
export const CONFIGURED = SUPABASE_ANON_KEY.length > 20;

// 離線寬限：最後一次向伺服器驗證成功後，可離線使用的時間
export const OFFLINE_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

// 帳號對應的內部 email 網域（員工不需要真實 email）
export const ACCOUNT_EMAIL_DOMAIN = "scan.local";

export const APP_VERSION = "1.0.0";
