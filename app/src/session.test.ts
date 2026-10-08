import { describe, expect, it } from "vitest";
import { decideSession } from "./session";

const DAY = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 9, 8, 12);

describe("decideSession", () => {
  it("沒有 session 一律回登入頁", () => {
    expect(decideSession({ hasSession: false, online: true, verify: "valid", lastVerifiedAt: now, now })).toBe("login");
  });
  it("有網路且伺服器驗證成功 → 可用", () => {
    expect(decideSession({ hasSession: true, online: true, verify: "valid", lastVerifiedAt: null, now })).toBe("ok");
  });
  it("有網路但伺服器說無效（被刪／停用）→ 清除資料，即使寬限期內", () => {
    expect(decideSession({ hasSession: true, online: true, verify: "invalid", lastVerifiedAt: now - DAY, now })).toBe("wipe");
  });
  it("離線：2 天前驗證過 → 可用；4 天前 → 清除", () => {
    expect(decideSession({ hasSession: true, online: false, verify: null, lastVerifiedAt: now - 2 * DAY, now })).toBe("ok");
    expect(decideSession({ hasSession: true, online: false, verify: null, lastVerifiedAt: now - 4 * DAY, now })).toBe("wipe");
    expect(decideSession({ hasSession: true, online: false, verify: null, lastVerifiedAt: null, now })).toBe("wipe");
  });
  it("有網路但伺服器連不上 → 依寬限期", () => {
    expect(decideSession({ hasSession: true, online: true, verify: "network_error", lastVerifiedAt: now - DAY, now })).toBe("ok");
    expect(decideSession({ hasSession: true, online: true, verify: "network_error", lastVerifiedAt: now - 5 * DAY, now })).toBe("wipe");
  });
});
