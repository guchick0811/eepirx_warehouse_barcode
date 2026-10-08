-- 002：APP 讀取資料的兩個 RPC 函式
-- 只輸出列舉的非敏感欄位；呼叫者必須是 app_users 中啟用的帳號。
-- 用函式而不用 view：同步程式在欄位結構變動時 DROP TABLE CASCADE 會刪掉 view，函式不受影響。

-- 共用檢查：未登入或帳號未啟用一律拒絕
create or replace function public.assert_active_user() returns void
language plpgsql stable security definer
set search_path = pg_catalog
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not exists (select 1 from public.app_users u where u.id = auth.uid() and u.is_active) then
    raise exception 'account inactive' using errcode = '42501';
  end if;
end
$$;
revoke all on function public.assert_active_user() from public, anon, authenticated;

-- 資料版本：product_data 最近一次成功同步的時間與筆數
create or replace function public.get_data_version() returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog
as $$
declare v jsonb;
begin
  perform public.assert_active_user();
  select jsonb_build_object('synced_at', l.finished_at, 'row_count', l.row_count, 'status', l.status)
    into v
  from erp.sync_log l
  where l.pg_table = 'product_data' and l.status in ('ok', 'count_mismatch')
  order by l.id desc
  limit 1;
  return coalesce(v, '{}'::jsonb);
end
$$;
revoke all on function public.get_data_version() from public, anon;
grant execute on function public.get_data_version() to authenticated;

-- 全部商品（HQ 總部倉庫的儲位／庫存／效期），連同版本一起回傳，確保資料與版本一致
create or replace function public.get_scan_products() returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog
as $$
declare products jsonb;
begin
  perform public.assert_active_user();
  select coalesce(jsonb_agg(jsonb_build_object(
      'c',  p.product_no,
      'n',  p.product_name,
      'u',  p.product_unit,
      'b',  p.public_bar_code,
      'b2', p.public_bar_code2,
      'b3', p.public_bar_code3,
      'pb', p.private_bar_code,
      'l',  p.stock_seat,
      'q',  p.stock_qty,
      'e',  p.valid_date,
      'e2', p.valid_date2,
      'd',  (p.is_delete = 'Y')
    )), '[]'::jsonb)
    into products
  from erp.product_data p;
  return jsonb_build_object('version', public.get_data_version(), 'products', products);
end
$$;
revoke all on function public.get_scan_products() from public, anon;
grant execute on function public.get_scan_products() to authenticated;

-- 防呆：erp schema 本來就沒開放給 API 角色，這裡再明確收回一次
revoke all on schema erp from public, anon, authenticated;
