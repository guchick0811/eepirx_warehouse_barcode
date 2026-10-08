// 登入狀態判斷的純邏輯（不碰網路），讓規則可以被測試：
// - 有網路：一定向伺服器驗證；驗證失敗（帳號被刪／停用／token 失效）→ 清除資料回登入頁
// - 沒網路：最後一次成功驗證在寬限期內才可用，逾期 → 清除資料回登入頁
import { OFFLINE_GRACE_MS } from "./config";

export type VerifyOutcome = "valid" | "invalid" | "network_error";
export type SessionDecision = "ok" | "login" | "wipe";

export interface SessionInput {
  hasSession: boolean;
  online: boolean;
  verify: VerifyOutcome | null;   // online 時的伺服器驗證結果
  lastVerifiedAt: number | null;  // 最後一次成功驗證（epoch ms）
  now: number;
  graceMs?: number;
}

export function decideSession(i: SessionInput): SessionDecision {
  if (!i.hasSession) return "login";
  const grace = i.graceMs ?? OFFLINE_GRACE_MS;
  const withinGrace = i.lastVerifiedAt !== null && i.now - i.lastVerifiedAt <= grace;
  if (i.online) {
    if (i.verify === "valid") return "ok";
    if (i.verify === "invalid") return "wipe";
    // 有網路但伺服器連不上：視同離線
  }
  return withinGrace ? "ok" : "wipe";
}
