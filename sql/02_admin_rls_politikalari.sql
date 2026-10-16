-- =====================================================================
-- 02 — ADMIN ERİŞİM POLİTİKALARI VE MÜKERRER KAYIT KORUMASI
-- Önkoşul: 01_admin_yetki.sql
--
-- Ne yapar:
--   • orders, businesses, sites, site_businesses için yalnızca is_admin() = true olan
--     kullanıcılara SELECT / INSERT / UPDATE izni veren politikalar ekler.
--     DELETE izni VERİLMEZ (panel hiçbir kaydı silmez).
--   • profiles için adminlere yalnızca SELECT izni ekler (hesap değişiklikleri Edge Function ile).
--   • businesses (ad) ve sites (slug) için, mevcut veride mükerrer kayıt YOKSA
--     büyük/küçük harf duyarsız benzersiz indeks oluşturur. Mükerrer varsa indeksi
--     atlar ve NOTICE ile bildirir (veri silinmez, değiştirilmez).
--
-- Etkisi:
--   • Politikalar "permissive" (eklemeli) olduğundan mevcut politikaların verdiği
--     erişimi AZALTMAZ; yalnızca adminlere erişim ekler. Müşteri ve işletme akışları etkilenmez.
--   • Bir tabloda RLS kapalıysa bu politikalar o tablo açılana kadar etkisizdir
--     (00 çıktısındaki rls_acik sütunu). RLS'i açmak ayrı bir karardır: 06 dosyası.
-- Tekrar çalıştırılabilir.
-- =====================================================================
begin;

do $$
declare t text;
begin
  foreach t in array array['orders','businesses','sites','site_businesses'] loop
    execute format('drop policy if exists admin_select on public.%I', t);
    execute format('drop policy if exists admin_insert on public.%I', t);
    execute format('drop policy if exists admin_update on public.%I', t);
    execute format('create policy admin_select on public.%I for select to authenticated using (public.is_admin())', t);
    execute format('create policy admin_insert on public.%I for insert to authenticated with check (public.is_admin())', t);
    execute format('create policy admin_update on public.%I for update to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

drop policy if exists admin_select on public.profiles;
create policy admin_select on public.profiles
  for select to authenticated using (public.is_admin());

-- Mükerrer işletme adı / site slug koruması (yalnızca mevcut veri uygunsa)
do $$
begin
  if exists (select 1 from public.businesses group by lower(trim(name)) having count(*) > 1) then
    raise notice 'businesses: aynı ada sahip kayıtlar var, benzersiz ad indeksi oluşturulmadı. 00 dosyasındaki 9. sorguyla inceleyin.';
  else
    create unique index if not exists businesses_name_unique_ci on public.businesses (lower(trim(name)));
  end if;

  if exists (select 1 from public.sites group by lower(trim(slug)) having count(*) > 1) then
    raise notice 'sites: aynı slug''a sahip kayıtlar var, benzersiz slug indeksi oluşturulmadı.';
  else
    create unique index if not exists sites_slug_unique_ci on public.sites (lower(trim(slug)));
  end if;

  -- Admin paneli site_businesses için upsert(onConflict: site_id,business_id) kullanır;
  -- bu benzersiz kısıt yoksa upsert hata verir.
  if not exists (
    select 1 from pg_index i
    join pg_class c on c.oid = i.indrelid
    where c.relname = 'site_businesses' and i.indisunique
      and (select array_agg(a.attname::text order by a.attname)
           from unnest(i.indkey) k join pg_attribute a on a.attrelid = c.oid and a.attnum = k)
          = array['business_id','site_id']
  ) then
    if exists (select 1 from public.site_businesses group by site_id, business_id having count(*) > 1) then
      raise notice 'site_businesses: mükerrer site-işletme çiftleri var, benzersiz indeks oluşturulmadı.';
    else
      create unique index if not exists site_businesses_site_business_unique on public.site_businesses (site_id, business_id);
    end if;
  end if;
end $$;

commit;
