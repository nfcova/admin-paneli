-- =====================================================================
-- 01 — SUNUCU TARAFI YETKİ FONKSİYONLARI VE YETKİ YÜKSELTME KORUMASI
--
-- Ne yapar:
--   • public.is_admin()            → giriş yapan kullanıcı profiles.role = 'admin' mi?
--   • public.current_business_id() → giriş yapan işletme kullanıcısının business_id'si
--   • profiles tablosuna tetikleyici: admin olmayan bir kullanıcı kendi (veya başkasının)
--     role / business_id alanını DEĞİŞTİREMEZ, admin/işletme rolüyle profil OLUŞTURAMAZ.
--
-- Etkisi:
--   • Mevcut veriye dokunmaz, tablo/sütun eklemez.
--   • SQL Editor, service_role (Edge Function) ve Supabase Auth tetikleyicileri
--     (auth.uid() boş olan çağrılar) etkilenmez.
--   • Mevcut kodda kullanıcıların kendi profil rolünü değiştirdiği bir akış yok
--     (işletme paneli, müşteri sitesi ve admin paneli incelendi); bu yüzden çalışan
--     bir akışı bozması beklenmez.
-- Tekrar çalıştırılabilir.
-- =====================================================================
begin;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Dönüş tipi profiles.business_id sütununun tipini izler (bigint/integer/uuid farketmez)
create or replace function public.current_business_id()
returns public.profiles.business_id%type
language sql
stable
security definer
set search_path = public
as $$
  select business_id from public.profiles
  where id = auth.uid() and role = 'business';
$$;

revoke all on function public.is_admin() from public;
revoke all on function public.current_business_id() from public;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.current_business_id() to authenticated;

create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- SQL Editor, service_role ve Auth tetikleyicileri: auth.uid() boş
  if auth.uid() is null then
    return new;
  end if;
  if public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.role in ('admin', 'business') or new.business_id is not null then
      raise exception 'Yetki yok: rol veya işletme bağlantısı yalnızca yönetici tarafından atanabilir.'
        using errcode = '42501';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.role is distinct from old.role
       or new.business_id is distinct from old.business_id
       or new.id is distinct from old.id then
      raise exception 'Yetki yok: rol veya işletme bağlantısı değiştirilemez.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_profile_privileges on public.profiles;
create trigger trg_protect_profile_privileges
  before insert or update on public.profiles
  for each row execute function public.protect_profile_privileges();

commit;

-- Doğrulama (admin hesabıyla SQL Editor'da auth.uid() boş olduğundan false döner; bu normaldir):
-- select public.is_admin();
