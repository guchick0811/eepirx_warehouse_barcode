"""套用 supabase/migrations/*.sql 到 Supabase，並檢查權限設定。

用法（psycopg 在「Supabase資料庫建置」的 venv 裡）：
  .venv/Scripts/python tools/apply_sql.py           # 套用全部
  .venv/Scripts/python tools/apply_sql.py --verify  # 只檢查

連線設定：本資料夾的 .env（SUPABASE_DB_URL、SUPABASE_DB_PASSWORD）；沒有就讀 Supabase資料庫建置/.env。
"""
import argparse
import os
import sys
import urllib.parse
import uuid
from pathlib import Path

import psycopg

ROOT = Path(__file__).resolve().parent.parent
ENV_CANDIDATES = [ROOT / ".env", Path(r"C:\Users\user\Desktop\Supabase資料庫建置\.env")]
MIGRATIONS = ROOT / "supabase" / "migrations"


def load_env() -> None:
    for path in ENV_CANDIDATES:
        if not path.exists():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            if v.strip():
                os.environ.setdefault(k.strip(), v.strip())
    # 兩個 .env 都讀：本專案留空的值（例如資料庫密碼）會由 Supabase資料庫建置/.env 補上
    if not os.environ.get("SUPABASE_DB_URL"):
        sys.exit("找不到 SUPABASE_DB_URL，請建立 .env")


def db_url() -> str:
    load_env()
    url = os.environ["SUPABASE_DB_URL"]
    if "[YOUR-PASSWORD]" in url:
        pwd = os.environ.get("SUPABASE_DB_PASSWORD", "")
        if not pwd:
            sys.exit("連線字串含 [YOUR-PASSWORD]，請在 .env 填 SUPABASE_DB_PASSWORD")
        url = url.replace("[YOUR-PASSWORD]", urllib.parse.quote(pwd, safe=""))
    if "sslmode=" not in url:
        url += ("&" if "?" in url else "?") + "sslmode=require"
    return url


def apply(pg: psycopg.Connection) -> None:
    for path in sorted(MIGRATIONS.glob("*.sql")):
        with pg.transaction(), pg.cursor() as cur:
            cur.execute(path.read_text(encoding="utf-8"))
        print(f"套用 {path.name}")


def expect_denied(cur, label: str, sql: str, params=()) -> None:
    """在 savepoint 內執行，必須失敗（權限不足）。"""
    try:
        cur.execute("savepoint t")
        cur.execute(sql, params)
        cur.execute("release savepoint t")
    except psycopg.Error as err:
        cur.execute("rollback to savepoint t")
        print(f"  OK   {label}：被拒（{err.sqlstate} {str(err).splitlines()[0]}）")
        return
    sys.exit(f"  FAIL {label}：竟然成功了")


def verify(pg: psycopg.Connection) -> None:
    print("檢查權限：")
    with pg.transaction(), pg.cursor() as cur:
        checks = [
            ("anon 不能執行 get_scan_products", "select has_function_privilege('anon', 'public.get_scan_products()', 'EXECUTE')", False),
            ("anon 不能執行 get_data_version", "select has_function_privilege('anon', 'public.get_data_version()', 'EXECUTE')", False),
            ("authenticated 可執行 get_scan_products", "select has_function_privilege('authenticated', 'public.get_scan_products()', 'EXECUTE')", True),
            ("anon 不能讀 app_users", "select has_table_privilege('anon', 'public.app_users', 'SELECT')", False),
            ("authenticated 不能寫 app_users", "select has_table_privilege('authenticated', 'public.app_users', 'INSERT, UPDATE, DELETE')", False),
            ("authenticated 不能讀稽核表", "select has_table_privilege('authenticated', 'public.app_user_audit', 'SELECT')", False),
            ("service_role 可寫 app_users", "select has_table_privilege('service_role', 'public.app_users', 'INSERT, UPDATE, DELETE')", True),
            ("service_role 可寫稽核表", "select has_table_privilege('service_role', 'public.app_user_audit', 'INSERT')", True),
            ("app_users 已開 RLS", "select relrowsecurity from pg_class where oid = 'public.app_users'::regclass", True),
            ("anon 無 erp schema 權限", "select has_schema_privilege('anon', 'erp', 'USAGE')", False),
            ("authenticated 無 erp schema 權限", "select has_schema_privilege('authenticated', 'erp', 'USAGE')", False),
        ]
        for label, sql, want in checks:
            got = cur.execute(sql).fetchone()[0]
            print(f"  {'OK  ' if got == want else 'FAIL'} {label}")
            if got != want:
                sys.exit(1)

        print("檢查函式行為：")
        expect_denied(cur, "未登入（auth.uid() 為空）呼叫 get_scan_products", "select public.get_scan_products()")
        cur.execute("set local role anon")
        expect_denied(cur, "anon 角色呼叫 get_scan_products", "select public.get_scan_products()")
        cur.execute("reset role")
        cur.execute("set local role authenticated")
        fake = str(uuid.uuid4())
        cur.execute("select set_config('request.jwt.claim.sub', %s, true)", (fake,))
        cur.execute("select set_config('request.jwt.claims', %s, true)", ('{"sub":"%s","role":"authenticated"}' % fake,))
        expect_denied(cur, "已登入但不在 app_users 的帳號呼叫 get_scan_products", "select public.get_scan_products()")
        expect_denied(cur, "已登入但不在 app_users 的帳號呼叫 get_data_version", "select public.get_data_version()")
        cur.execute("reset role")

        print("檢查輸出內容（以擁有者身分直接查，確認欄位與筆數）：")
        n = cur.execute("select count(*) from erp.product_data").fetchone()[0]
        ver = cur.execute("""select finished_at, row_count from erp.sync_log
                             where pg_table = 'product_data' and status in ('ok','count_mismatch')
                             order by id desc limit 1""").fetchone()
        print(f"  product_data {n:,} 筆；最近同步 {ver[0]}（{ver[1]:,} 筆）")
        src = cur.execute("select pg_get_functiondef('public.get_scan_products()'::regprocedure)").fetchone()[0]
        for bad in ("cost", "price", "vp_", "gross"):
            if bad in src:
                sys.exit(f"  FAIL get_scan_products 內含敏感欄位字樣：{bad}")
        print("  OK   get_scan_products 定義不含 cost / price / vp_ / gross")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--verify", action="store_true", help="只檢查，不套用")
    args = ap.parse_args()
    with psycopg.connect(db_url()) as pg:
        if not args.verify:
            apply(pg)
        verify(pg)
    print("完成")


if __name__ == "__main__":
    main()
