# 倉儲部掃碼查詢 APP

手機用相機掃商品條碼，立即顯示商品編號、國際條碼、名稱、儲位、現有庫存、效期（總部倉庫 HQ）。
PWA 形式：Android / iPhone 都用瀏覽器「加入主畫面」安裝，不需上架。資料來自 Supabase 的 `erp.product_data`（每天 02:00 由 ERP 同步），需帳號登入。

## 架構

```
手機 PWA（GitHub Pages，只放程式碼）
  │ supabase-js（anon key + 登入者 JWT）
  ▼
Supabase 專案 bniocopeeizpsxpyuwnb
  ├ Auth：帳號密碼登入（帳號 wang01 → 內部 email wang01@scan.local）
  ├ public.app_users / app_user_audit：帳號檔與稽核（只讀；寫入只能經 Edge Function）
  ├ public.get_scan_products() / get_data_version()：SECURITY DEFINER 函式，只輸出非敏感欄位
  └ Edge Function admin-users：人員管理（新增／停用／刪除／重設密碼）
```

資料流：登入 → 下載全部商品到手機 IndexedDB → 掃描即時比對（離線可用）→ 有網路時自動比對雲端版本，有新資料就提示。

## 目錄

| 路徑 | 說明 |
|---|---|
| `app/` | PWA 原始碼（Vite + TypeScript） |
| `supabase/migrations/` | 資料庫設定 SQL（帳號表、函式、權限） |
| `supabase/functions/admin-users/` | 人員管理 Edge Function |
| `tools/apply_sql.py` | 套用 SQL 並檢查權限 |
| `tools/create_first_admin.py` | 建立第一個管理者 |
| `tools/test_access.mjs` | 權限整合測試（真實專案） |
| `.github/workflows/deploy.yml` | push 到 main 自動建置部署到 GitHub Pages |

## 第一次建置（管理者在電腦上做一次）

Python 指令都用 `Supabase資料庫建置` 專案的 venv（已裝 psycopg）：
`PY="C:/Users/user/Desktop/Supabase資料庫建置/.venv/Scripts/python"`

1. **Supabase Dashboard 設定**（Authentication → Settings / Providers）
   - Email provider 保持開啟；關閉「Allow new users to sign up」、關閉「Allow anonymous sign-ins」
   - Minimum password length：8
   - JWT expiry：900 秒（15 分鐘，讓停用／刪除最慢 15 分鐘內生效）
2. **金鑰**（Project Settings → API）
   - anon key → 填入 `app/.env` 的 `VITE_SUPABASE_ANON_KEY`（也要放到 GitHub repo 的 Variables：`SUPABASE_ANON_KEY`）
   - service_role key → 填入根目錄 `.env` 的 `SUPABASE_SERVICE_ROLE_KEY`（只用於下一步，用完刪掉）
   - 根目錄 `.env` 的 `SUPABASE_DB_URL` / `SUPABASE_DB_PASSWORD` 與 `Supabase資料庫建置/.env` 相同（留空會自動讀那邊）
3. **套用資料庫設定**：`$PY tools/apply_sql.py`（會順便檢查所有權限，全部 OK 才算完成）
4. **建立第一個管理者**：`$PY tools/create_first_admin.py --username admin`（密碼現場輸入）
5. **部署 Edge Function**（在專案根目錄）
   ```bash
   npx supabase login
   npx supabase functions deploy admin-users --project-ref bniocopeeizpsxpyuwnb
   npx supabase secrets set ALLOWED_ORIGINS="https://guchick0811.github.io,http://localhost:5173" --project-ref bniocopeeizpsxpyuwnb
   ```
6. **整合測試**：`cd app && node ../tools/test_access.mjs`（會建立並刪除測試帳號 `test_zz01`）
7. **部署 APP**：建立 GitHub repo（名稱不易猜測）→ Settings → Pages → Source 選「GitHub Actions」→ Settings → Secrets and variables → Actions → Variables 新增 `SUPABASE_ANON_KEY` → push 到 main。
   網址：`https://guchick0811.github.io/eepirx_warehouse_barcode/`
8. **Supabase Auth URL**：Authentication → URL Configuration → Site URL 填上述網址。

## 本機開發

```bash
cd app
npm install
npm run dev        # http://localhost:5173（相機在 localhost 可用）
npm test           # 單元測試
npm run build      # 產出 dist/
```

## 日常使用

- **安裝到手機**：iPhone 用 Safari 開網址 → 分享 → 加入主畫面；Android 用 Chrome → ⋮ → 安裝應用程式。APP 內「說明」頁有圖解步驟。
- **新增同仁**：管理者登入 APP → 人員 → 新增帳號，把帳號密碼告知本人。
- **離職**：人員頁按「停用」（保留紀錄）或「刪除」。對方手機下次連線開啟 APP 即被登出並清除資料；離線最多再用 3 天。
- **忘記密碼**：人員頁「重設密碼」。
- **資料更新**：不需人工操作。ERP 每天 02:00 同步到雲端，APP 開啟時自動提示更新。

## 資安設計摘要

- `anon`／`authenticated` 對 `erp` schema 無任何權限；APP 只能透過兩個函式取得 12 個非敏感欄位（無成本、售價、供應商）。
- `app_users` 只有 SELECT policy（本人一列、管理者全部），沒有任何寫入 policy，無法自行提權。
- Edge Function 內以 `auth.getUser()` 向 Auth 伺服器驗證呼叫者，再檢查 `role='admin'`；CORS 只允許白名單來源；所有操作寫入稽核表。
- 停用＝Auth 層 ban + `is_active=false`；刪除＝刪除 Auth 帳號；JWT 15 分鐘。
- 手機端：資料存 IndexedDB，登出或寬限期逾時即清除；所有資料以 `textContent` 寫入 DOM；CSP 限制只能連 Supabase；掃碼 wasm 由本機打包，執行期不連任何 CDN；Service Worker 不快取 API 回應。
- `.env`、`參考資料/` 在 `.gitignore`，service role key 只在本機短暫使用。

## 疑難排解

| 現象 | 處理 |
|---|---|
| 相機打不開 | 手機設定允許瀏覽器／APP 使用相機；iPhone 必須用 Safari 加入主畫面 |
| 登入顯示「帳號未啟用」 | 管理者在人員頁確認狀態 |
| 「尚未下載商品資料」 | 連網後到「資料」頁按「立即同步」 |
| `apply_sql.py` 報 FAIL | 依訊息檢查 `supabase/migrations/*.sql` 的 REVOKE/GRANT，重新執行 |
| `get_scan_products` 報錯 | ERP 同步程式重建了 `product_data`，確認欄位名稱後重跑 `apply_sql.py` |
| 同步時間沒更新 | 看 `Supabase資料庫建置/logs/` 或 `select * from erp.sync_status` |
