-- =====================================================================
-- 03 — DENETLENEBİLİR İŞLEM GÜNLÜĞÜ (admin_audit_log)
-- Önkoşul: 01_admin_yetki.sql
--
-- Ne yapar:
--   • Yeni tablo: public.admin_audit_log (yalnızca ekleme yapılır).
--   • orders, businesses, sites, site_businesses, profiles tablolarına AFTER tetikleyici:
--     her INSERT/UPDATE/DELETE için kim (auth.uid + e-posta), ne zaman, hangi kayıt,
--     eski ve yeni değerler kaydedilir. Müşteri RPC'leri gibi anonim çağrılarda
--     actor boş kalır.
--   • Günlüğü yalnızca adminler okuyabilir; tarayıcıdan hiç kimse yazamaz/değiştiremez/silemez
--     (tetikleyici SECURITY DEFINER ile yazar).
--
-- Etkisi:
--   • Mevcut tablolara sütun eklemez, mevcut veriyi değiştirmez.
--   • Her yazma işlemine küçük bir ek kayıt maliyeti getirir.
--   • Tetikleyici içinde hata olursa ana işlem de başarısız olur; bu yüzden tetikleyici
--     yalnızca jsonb işlemleri yapar (hata riski düşük).
-- Tekrar çalıştırılabilir.
-- =====================================================================
begin;

create table if not exists public.admin_audit_log (
  id           bigint generated always as identity primary key,
  created_at   timestamptz not null default now(),
  actor_id     uuid,
  actor_email  text,
  actor_role   text,
  action       text not null check (action in ('INSERT','UPDATE','DELETE')),
  table_name   text not null,
  record_id    text,
  business_id  text,
  site_id      text,
  order_id     text,
  old_data     jsonb,
  new_data     jsonb
);
create index if not exists admin_audit_log_created_idx  on public.admin_audit_log (created_at desc);
create index if not exists admin_audit_log_business_idx on public.admin_audit_log (business_id, created_at desc);
create index if not exists admin_audit_log_site_idx     on public.admin_audit_log (site_id, created_at desc);
create index if not exists admin_audit_log_order_idx    on public.admin_audit_log (order_id, created_at desc);

alter table public.admin_audit_log enable row level security;
revoke all on public.admin_audit_log from anon, authenticated;
grant select on public.admin_audit_log to authenticated;
drop policy if exists admin_read on public.admin_audit_log;
create policy admin_read on public.admin_audit_log
  for select to authenticated using (public.is_admin());

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r  jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  o  jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  n  jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  uid uuid := auth.uid();
begin
  -- Değişiklik yoksa (aynı değerle UPDATE) kayıt tutma
  if tg_op = 'UPDATE' and o = n then
    return null;
  end if;
  insert into public.admin_audit_log
    (actor_id, actor_email, actor_role, action, table_name, record_id, business_id, site_id, order_id, old_data, new_data)
  values (
    uid,
    nullif(auth.jwt() ->> 'email', ''),
    (select role from public.profiles where id = uid),
    tg_op,
    tg_table_name,
    r ->> 'id',
    case when tg_table_name = 'businesses' then r ->> 'id' else r ->> 'business_id' end,
    case when tg_table_name = 'sites'      then r ->> 'id' else r ->> 'site_id' end,
    case when tg_table_name = 'orders'     then r ->> 'id' else null end,
    o,
    n
  );
  return null;
end;
$$;
revoke all on function public.audit_row_change() from public;

do $$
declare t text;
begin
  foreach t in array array['orders','businesses','sites','site_businesses','profiles'] loop
    execute format('drop trigger if exists trg_audit_%1$s on public.%1$I', t);
    execute format('create trigger trg_audit_%1$s after insert or update or delete on public.%1$I for each row execute function public.audit_row_change()', t);
  end loop;
end $$;

commit;
