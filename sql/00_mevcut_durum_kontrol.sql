-- =====================================================================
-- 00 — MEVCUT DURUM KONTROLÜ (SALT OKUNUR)
-- Hiçbir şeyi değiştirmez. Supabase SQL Editor'da çalıştırın ve her sonuç
-- tablosunu kaydedin. 05/06 dosyalarından önce bu çıktıyı inceleyin.
-- SQL Editor yalnızca son sorgunun sonucunu gösteriyorsa sorguları tek tek seçip çalıştırın.
-- =====================================================================

-- 1) Tablolar ve RLS durumu
select c.relname as tablo,
       c.relrowsecurity as rls_acik,
       c.relforcerowsecurity as rls_zorunlu
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by 1;

-- 2) Mevcut RLS politikaları
select tablename as tablo, policyname as politika, cmd as islem, roles as roller,
       qual as using_kosulu, with_check
from pg_policies where schemaname = 'public'
order by tablename, policyname;

-- 3) İlgili tabloların sütunları
select table_name as tablo, column_name as sutun, data_type as tip,
       is_nullable as bos_olabilir, column_default as varsayilan
from information_schema.columns
where table_schema = 'public'
  and table_name in ('profiles','businesses','sites','site_businesses','orders','order_assignments','services')
order by table_name, ordinal_position;

-- 4) Benzersizlik kısıtları ve indeksler
select tablename as tablo, indexname as indeks, indexdef as tanim
from pg_indexes
where schemaname = 'public'
  and tablename in ('profiles','businesses','sites','site_businesses','orders')
order by 1, 2;

-- 5) public şemasındaki fonksiyonlar (SECURITY DEFINER olup olmadıkları dahil)
select p.proname as fonksiyon,
       pg_get_function_identity_arguments(p.oid) as parametreler,
       pg_get_function_result(p.oid) as donus,
       p.prosecdef as security_definer
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by 1;

-- 6) Siparişle ilgili RPC fonksiyonlarının tam tanımları
select p.proname as fonksiyon, pg_get_functiondef(p.oid) as tanim
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('admin_assign_order','create_public_order','get_public_site',
                    'get_public_order','respond_time_proposal','cancel_public_order');

-- 7) Tetikleyiciler
select event_object_table as tablo, trigger_name as tetikleyici,
       action_timing as zaman, event_manipulation as olay, action_statement as eylem
from information_schema.triggers
where trigger_schema in ('public','auth')
order by 1, 2;

-- 8) Rol dağılımı ve işletme bağlantıları
select role, count(*) as kullanici, count(business_id) as isletmeye_bagli
from public.profiles group by role order by 1;

-- 9) Mükerrer kayıt kontrolü (02 dosyasındaki benzersiz indeksler için)
select 'isletme_adi' as tur, lower(trim(name)) as deger, count(*) from public.businesses group by 2 having count(*) > 1
union all
select 'site_slug', lower(trim(slug)), count(*) from public.sites group by 2 having count(*) > 1;

-- 10) Durum ve saat önerisi değerleri (gerçekte kullanılan değerler)
select status, time_proposal_status, count(*) from public.orders group by 1, 2 order by 1, 2;

-- 11) Tablo yetkileri (anon / authenticated)
select table_name as tablo, grantee as rol, string_agg(privilege_type, ', ' order by privilege_type) as yetkiler
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon','authenticated')
  and table_name in ('profiles','businesses','sites','site_businesses','orders')
group by 1, 2 order by 1, 2;
