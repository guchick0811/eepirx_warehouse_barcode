-- 001：帳號檔、稽核表、管理者判斷函式、RLS
-- 設計原則：public schema 有預設授權（新物件自動開放給 anon/authenticated），
-- 所以每個物件建立後都要明確 REVOKE，再只給必要的權限。

create table if not exists public.app_users (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null default '',
  role text not null default 'staff' check (role in ('admin', 'staff')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.app_users is '掃碼 APP 帳號檔；寫入只能由 Edge Function（service role）進行';

revoke all on table public.app_users from public, anon, authenticated;
grant select on table public.app_users to authenticated;
alter table public.app_users enable row level security;

-- 管理者判斷：SECURITY DEFINER 以表擁有者身分讀 app_users，不受 RLS 影響，避免 policy 遞迴
create or replace function public.is_admin() returns boolean
language sql stable security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1 from public.app_users u
    where u.id = auth.uid() and u.role = 'admin' and u.is_active
  )
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- 只有 SELECT policy：本人一列、管理者全部。沒有任何 INSERT/UPDATE/DELETE policy。
drop policy if exists app_users_select_self on public.app_users;
create policy app_users_select_self on public.app_users
  for select to authenticated using (id = auth.uid());
drop policy if exists app_users_select_admin on public.app_users;
create policy app_users_select_admin on public.app_users
  for select to authenticated using (public.is_admin());

-- 稽核表：只有 service role（Edge Function）可讀寫
create table if not exists public.app_user_audit (
  id bigserial primary key,
  actor_id uuid,
  actor_username text,
  action text not null,
  target_username text,
  detail jsonb,
  at timestamptz not null default now()
);
comment on table public.app_user_audit is '人員管理操作紀錄（誰、做了什麼、對誰、何時）';
revoke all on table public.app_user_audit from public, anon, authenticated;
revoke all on sequence public.app_user_audit_id_seq from public, anon, authenticated;
alter table public.app_user_audit enable row level security;

-- service role（Edge Function 用）必須明確授權：postgres 建立的物件不會自動給 service_role
grant all on table public.app_users, public.app_user_audit to service_role;
grant usage, select on sequence public.app_user_audit_id_seq to service_role;
