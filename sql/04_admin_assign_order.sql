-- =====================================================================
-- 04 — GÜVENLİ SİPARİŞ ATAMA: public.admin_assign_order(p_order_id, p_business_id)
-- Önkoşul: 01_admin_yetki.sql
--
-- ÖNCE 00 dosyasının 5. ve 6. sorgularıyla mevcut admin_assign_order tanımını inceleyin.
-- Mevcut fonksiyonun içeriği koddan görülemediği için bu dosya onu, aşağıdaki kuralları
-- açıkça uygulayan bir sürümle DEĞİŞTİRİR (aynı ad ve parametre adlarıyla; admin paneli
-- zaten { p_order_id, p_business_id } ile çağırıyor).
--
-- Kurallar (sunucu tarafında):
--   1. Çağıran admin olmalı (is_admin()).
--   2. Sipariş satırı FOR UPDATE ile kilitlenir → aynı anda işletmenin kabul etmesi veya
--      müşterinin iptal etmesiyle çakışmaz.
--   3. Yalnızca 'Beklemede' durumundaki siparişler atanabilir/yeniden atanabilir.
--      (Kabul edilmiş bir işi başka işletmeye taşımak işletme panelinde tutarsızlık yaratır.)
--   4. Hedef işletme mevcut ve aktif olmalı, siparişin sitesine site_businesses ile AKTİF bağlı olmalı.
--   5. İşletme değişiyorsa ve önceki işletmenin yanıt bekleyen bir saat önerisi varsa öneri
--      alanları temizlenir (yeni işletme eski işletmenin önerisiyle bağlanmaz). Müşterinin
--      kabul/ret ettiği öneriler olduğu gibi kalır.
--   6. Dönüş: jsonb { ok, message, order_id, business_id }.
--
-- Güvenlik ağı: Aynı adla FARKLI parametre tiplerine sahip bir fonksiyon varsa dosya hiçbir şey
-- değiştirmeden durur (aşırı yükleme PostgREST çağrısını belirsiz hale getirirdi).
-- Tekrar çalıştırılabilir.
-- =====================================================================
begin;

do $$
declare sig text;
begin
  for sig in
    select pg_get_function_identity_arguments(p.oid)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'admin_assign_order'
  loop
    if sig <> 'p_order_id bigint, p_business_id bigint' then
      raise exception 'Mevcut admin_assign_order(%) imzası farklı. Hiçbir değişiklik yapılmadı. 00 çıktısını paylaşın; dosya bu imzaya göre uyarlanmalı.', sig;
    end if;
  end loop;
end $$;

-- Dönüş tipi farklıysa CREATE OR REPLACE hata verir; bu yüzden aynı imzalı sürüm önce kaldırılır
-- (aynı işlem bloğunda yeniden oluşturulur; hata olursa tümü geri alınır).
drop function if exists public.admin_assign_order(bigint, bigint);

create function public.admin_assign_order(p_order_id bigint, p_business_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.orders%rowtype;
  b public.businesses%rowtype;
  proposal text;
begin
  if not public.is_admin() then
    raise exception 'Yetki yok: bu işlem yalnızca yöneticiler içindir.' using errcode = '42501';
  end if;

  select * into o from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Sipariş bulunamadı (#%).', p_order_id using errcode = 'P0002';
  end if;

  if o.status is distinct from 'Beklemede' then
    raise exception 'Yalnızca "Beklemede" durumundaki siparişler atanabilir (mevcut durum: %).', o.status
      using errcode = '22023';
  end if;

  select * into b from public.businesses where id = p_business_id;
  if not found then
    raise exception 'İşletme bulunamadı (#%).', p_business_id using errcode = 'P0002';
  end if;
  if not coalesce(b.active, false) then
    raise exception 'İşletme pasif: %', b.name using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.site_businesses sb
    where sb.site_id = o.site_id and sb.business_id = p_business_id and coalesce(sb.active, false)
  ) then
    raise exception 'İşletme bu siparişin sitesine bağlı değil veya bağlantı kapalı.' using errcode = '22023';
  end if;

  if o.business_id is not distinct from p_business_id then
    return jsonb_build_object('ok', true, 'message', 'Sipariş zaten bu işletmeye atanmış.',
                              'order_id', o.id, 'business_id', p_business_id);
  end if;

  proposal := lower(trim(coalesce(o.time_proposal_status, '')));
  if o.proposed_service_time is not null
     and proposal not in ('accepted','approved','kabul','kabul edildi','kabul_edildi',
                          'rejected','declined','ret','red','reddedildi','reddedilen') then
    update public.orders
       set business_id = p_business_id,
           proposed_service_time = null,
           time_proposal_status = null,
           time_proposed_at = null
     where id = o.id;
  else
    update public.orders set business_id = p_business_id where id = o.id;
  end if;

  return jsonb_build_object('ok', true, 'message', 'Sipariş atandı.',
                            'order_id', o.id, 'business_id', p_business_id);
end;
$$;

revoke all on function public.admin_assign_order(bigint, bigint) from public, anon;
grant execute on function public.admin_assign_order(bigint, bigint) to authenticated;

commit;
