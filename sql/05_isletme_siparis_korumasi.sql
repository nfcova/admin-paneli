-- =====================================================================
-- 05 — İŞLETME SİPARİŞ GÜNCELLEME KORUMASI (durum makinesi sunucu tarafında)
-- Önkoşul: 01_admin_yetki.sql
--
-- Sorun: İşletme paneli siparişleri doğrudan tabloyu güncelleyerek değiştiriyor. Kurallar
-- ("öneri yanıt beklerken kabul edilemez", "yalnızca kendi siparişi") şu an tarayıcının
-- gönderdiği filtrelere dayanıyor. Değiştirilmiş bir istemci kendi siparişlerinde fiyat,
-- müşteri bilgisi, işletme ataması dahil her alanı değiştirebilir.
--
-- Ne yapar (yalnızca profiles.role = 'business' olan kullanıcıların UPDATE işlemlerinde):
--   • Sipariş, kullanıcının işletmesine ait olmalı.
--   • Yalnızca şu alanlar değişebilir: status, accepted_at, rejected_at, rejection_reason,
--     completed_at, proposed_service_time, time_proposal_status, time_proposed_at (ve varsa updated_at).
--   • İzinli durum geçişleri: Beklemede→Kabul Edildi, Beklemede→Reddedildi,
--     Kabul Edildi→Devam Ediyor, Devam Ediyor→Tamamlandı.
--   • Müşteri yanıtı bekleyen saat önerisi varken Kabul Edildi'ye geçilemez.
--   • İşletme yalnızca 'Beklemede' siparişte yeni öneri (time_proposal_status = 'pending')
--     gönderebilir; müşterinin yanıtını değiştiremez.
--
-- Etkilenmeyenler: adminler, müşteri RPC'leri (anonim çağrı, auth.uid() boş), service_role, SQL Editor.
-- İşletme panelinin bugün gönderdiği güncellemelerin tamamı bu kurallara uyar
-- (kabul, ret, saat önerisi, işi başlat, tamamla). Tekrar çalıştırılabilir.
-- =====================================================================
begin;

create or replace function public.guard_business_order_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  me_role text;
  my_biz  text;
  allowed text[] := array['status','accepted_at','rejected_at','rejection_reason','completed_at',
                          'proposed_service_time','time_proposal_status','time_proposed_at','updated_at'];
  answered text[] := array['accepted','approved','kabul','kabul edildi','kabul_edildi',
                           'rejected','declined','ret','red','reddedildi','reddedilen'];
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  select role, business_id::text into me_role, my_biz from public.profiles where id = auth.uid();
  if me_role is distinct from 'business' then
    return new;  -- diğer roller için erişim RLS politikalarına bırakılır
  end if;

  if old.business_id::text is distinct from my_biz then
    raise exception 'Bu sipariş işletmenize ait değil.' using errcode = '42501';
  end if;

  if (to_jsonb(new) - allowed) is distinct from (to_jsonb(old) - allowed) then
    raise exception 'İşletmeler yalnızca sipariş durumu ve saat önerisi alanlarını değiştirebilir.' using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    if not (
         (old.status = 'Beklemede'    and new.status in ('Kabul Edildi','Reddedildi'))
      or (old.status = 'Kabul Edildi' and new.status = 'Devam Ediyor')
      or (old.status = 'Devam Ediyor' and new.status = 'Tamamlandı')
    ) then
      raise exception 'Geçersiz durum geçişi: % → %', old.status, new.status using errcode = '22023';
    end if;
    if new.status = 'Kabul Edildi'
       and old.proposed_service_time is not null
       and lower(trim(coalesce(old.time_proposal_status,''))) <> all(answered) then
      raise exception 'Müşteri saat önerisine yanıt vermeden sipariş kabul edilemez.' using errcode = '22023';
    end if;
  end if;

  if new.proposed_service_time is distinct from old.proposed_service_time
     or new.time_proposal_status is distinct from old.time_proposal_status
     or new.time_proposed_at is distinct from old.time_proposed_at then
    if old.status <> 'Beklemede' or new.status <> 'Beklemede' then
      raise exception 'Saat önerisi yalnızca beklemedeki siparişlerde yapılabilir.' using errcode = '22023';
    end if;
    if new.proposed_service_time is null or new.time_proposal_status is distinct from 'pending' then
      raise exception 'İşletme yalnızca yeni bir saat önerisi gönderebilir; müşteri yanıtını değiştiremez.' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;
revoke all on function public.guard_business_order_update() from public;

drop trigger if exists trg_guard_business_order on public.orders;
create trigger trg_guard_business_order
  before update on public.orders
  for each row execute function public.guard_business_order_update();

commit;
