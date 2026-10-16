-- =====================================================================
-- 06 — RLS'İ ETKİNLEŞTİRME VE İŞLETME ERİŞİMİNİ KENDİ VERİSİYLE SINIRLAMA
-- Önkoşul: 01 ve 02. ÖNCE 00 çıktısını inceleyin.
--
-- ⚠ Bu dosya erişim kurallarını değiştirir. Aşağıdaki durumlarda ÇALIŞTIRMAYIN:
--   • 00 çıktısında bu tablolarda RLS zaten açık ve iyi tanımlanmış politikalar varsa
--     (o durumda yalnızca eksik politikaları ekleyin; bana 00 çıktısını gönderin).
--   • Müşteri sitesinin kullandığı RPC'ler SECURITY DEFINER değilse — dosya bunu kendisi
--     kontrol eder ve hiçbir şey değiştirmeden durur.
--
-- Ne yapar:
--   • profiles, businesses, sites, site_businesses, orders için RLS'i açar (açıksa dokunmaz).
--   • İşletme kullanıcılarına yalnızca KENDİ verisini veren politikalar ekler:
--       profiles: kendi satırı · businesses: kendi işletmesi · orders: kendi siparişleri (okuma+güncelleme)
--       site_businesses: kendi bağlantıları · sites: bağlı olduğu veya siparişi bulunan siteler
--   • Mevcut politikaları SİLMEZ. anon/public rolüne açık politikalar varsa NOTICE ile listeler;
--     bunlar açık kalmaya devam eder ve ayrıca incelenmelidir.
--
-- Beklenen etki:
--   • Müşteri sitesi yalnızca SECURITY DEFINER RPC'ler kullandığı için etkilenmez.
--   • İşletme paneli yalnızca kendi siparişlerini, işletmesini ve profilini okur/günceller → çalışır.
--   • Admin paneli 02'deki admin politikalarıyla çalışır.
--   • Anonim (giriş yapmamış) istemcilerin tablolara doğrudan erişimi kapanır.
-- Geri alma: alter table public.<tablo> disable row level security;  (yalnızca acil durumda)
-- Tekrar çalıştırılabilir.
-- =====================================================================
begin;

-- Güvenlik ağı 1: müşteri RPC'leri SECURITY DEFINER olmalı
do $$
declare f text; missing text := '';
begin
  foreach f in array array['get_public_site','create_public_order','get_public_order','respond_time_proposal','cancel_public_order'] loop
    if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and p.proname = f and p.prosecdef) then
      missing := missing || f || ' ';
    end if;
  end loop;
  if missing <> '' then
    raise exception 'Şu RPC''ler bulunamadı veya SECURITY DEFINER değil: %. RLS açılırsa müşteri sitesi bozulabilir. Hiçbir değişiklik yapılmadı.', missing;
  end if;
end $$;

-- Güvenlik ağı 2: admin politikaları (02) ve yardımcı fonksiyonlar (01) kurulu olmalı
do $$
begin
  if not exists (select 1 from pg_proc where proname = 'current_business_id') then
    raise exception '01_admin_yetki.sql çalıştırılmamış. Hiçbir değişiklik yapılmadı.';
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='orders' and policyname='admin_select') then
    raise exception '02_admin_rls_politikalari.sql çalıştırılmamış. Hiçbir değişiklik yapılmadı.';
  end if;
end $$;

-- Bilgi: anon/public'e açık mevcut politikalar
do $$
declare r record;
begin
  for r in select tablename, policyname, cmd, roles from pg_policies
           where schemaname = 'public'
             and tablename in ('profiles','businesses','sites','site_businesses','orders')
             and (roles && array['anon','public']::name[])
  loop
    raise notice 'İNCELEYİN: % tablosundaki "%" politikası (%) anon/public rolüne açık.', r.tablename, r.policyname, r.cmd;
  end loop;
end $$;

-- İşletme politikaları
drop policy if exists self_select on public.profiles;
create policy self_select on public.profiles
  for select to authenticated using (id = auth.uid());

drop policy if exists business_select_own on public.businesses;
create policy business_select_own on public.businesses
  for select to authenticated using (id = public.current_business_id());

drop policy if exists business_select_own on public.orders;
create policy business_select_own on public.orders
  for select to authenticated using (business_id = public.current_business_id());

drop policy if exists business_update_own on public.orders;
create policy business_update_own on public.orders
  for update to authenticated
  using (business_id = public.current_business_id())
  with check (business_id = public.current_business_id());

drop policy if exists business_select_own on public.site_businesses;
create policy business_select_own on public.site_businesses
  for select to authenticated using (business_id = public.current_business_id());

drop policy if exists business_select_related on public.sites;
create policy business_select_related on public.sites
  for select to authenticated using (
    exists (select 1 from public.site_businesses sb where sb.site_id = sites.id and sb.business_id = public.current_business_id())
    or exists (select 1 from public.orders o where o.site_id = sites.id and o.business_id = public.current_business_id())
  );

alter table public.profiles        enable row level security;
alter table public.businesses      enable row level security;
alter table public.sites           enable row level security;
alter table public.site_businesses enable row level security;
alter table public.orders          enable row level security;

commit;
