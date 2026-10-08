"""建立第一個管理者帳號（之後的帳號都在 APP 的「人員管理」頁建立）。

需要本資料夾 .env 內有：
  SUPABASE_SERVICE_ROLE_KEY=...   （Dashboard → Project Settings → API → service_role；用完可刪除）
  SUPABASE_DB_URL / SUPABASE_DB_PASSWORD（與 apply_sql.py 相同，找不到時改讀 Supabase資料庫建置/.env）

用法：
  "C:/Users/user/Desktop/Supabase資料庫建置/.venv/Scripts/python" tools/create_first_admin.py --username admin
密碼在執行時輸入，不會寫進任何檔案。
"""
import argparse
import getpass
import json
import re
import sys
import urllib.error
import urllib.request

import psycopg

from apply_sql import db_url, load_env
import os

SUPABASE_URL = "https://bniocopeeizpsxpyuwnb.supabase.co"
EMAIL_DOMAIN = "scan.local"


def create_auth_user(service_key: str, email: str, password: str, username: str) -> str:
    req = urllib.request.Request(
        f"{SUPABASE_URL}/auth/v1/admin/users",
        data=json.dumps({"email": email, "password": password, "email_confirm": True, "user_metadata": {"username": username}}).encode(),
        headers={"apikey": service_key, "Authorization": f"Bearer {service_key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.load(resp)["id"]
    except urllib.error.HTTPError as err:
        sys.exit(f"建立 Auth 帳號失敗：{err.code} {err.read().decode(errors='replace')[:300]}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--username", default="admin")
    ap.add_argument("--display-name", default="管理者")
    args = ap.parse_args()
    username = args.username.strip().lower()
    if not re.fullmatch(r"[a-z0-9_]{3,20}", username):
        sys.exit("帳號格式：3～20 碼小寫英數字或底線")

    load_env()
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not service_key:
        sys.exit("缺少 SUPABASE_SERVICE_ROLE_KEY，請填入 .env")

    pw1 = getpass.getpass("設定管理者密碼（至少 8 碼）：")
    pw2 = getpass.getpass("再輸入一次：")
    if pw1 != pw2 or len(pw1) < 8:
        sys.exit("兩次密碼不一致或少於 8 碼")

    with psycopg.connect(db_url()) as pg, pg.cursor() as cur:
        if cur.execute("select 1 from public.app_users where username = %s", (username,)).fetchone():
            sys.exit(f"帳號 {username} 已存在")
        uid = create_auth_user(service_key, f"{username}@{EMAIL_DOMAIN}", pw1, username)
        cur.execute(
            "insert into public.app_users (id, username, display_name, role, is_active) values (%s, %s, %s, 'admin', true)",
            (uid, username, args.display_name),
        )
        cur.execute(
            "insert into public.app_user_audit (actor_id, actor_username, action, target_username, detail) "
            "values (%s, %s, 'create', %s, %s)",
            (uid, "setup", username, json.dumps({"role": "admin", "via": "create_first_admin.py"})),
        )
        pg.commit()
    print(f"管理者 {username} 已建立。請用 APP 登入；service role key 可從 .env 移除。")


if __name__ == "__main__":
    main()
