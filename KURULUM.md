# BAKSANA Admin — Supabase kurulum rehberi

Bu rehber, admin panelinin tüm özelliklerinin çalışması için **sizin elle yapmanız gereken** Supabase işlemlerini sırasıyla anlatır.
Panel bu adımlar yapılmadan da açılır. Kurulu olmayan bölümler kendini kapatır ve **Ayarlar ve altyapı** sayfasında hangi adımın eksik olduğu görünür.

| Nereye uygulanır | Dosya / komut |
|---|---|
| **Supabase SQL Editor** | `sql/00` … `sql/06` |
| **Terminal (Supabase CLI)** | Edge Function dağıtımı (Adım 4) |
| **Supabase Dashboard → Authentication** | E-posta / davet ayarları (Adım 5) |

> Hiçbir SQL dosyası veri silmez. Her dosya `begin … commit` içinde çalışır: bir hata olursa o dosyadaki değişikliklerin tamamı geri alınır. Tüm dosyalar tekrar çalıştırılabilir.

---

## Adım 0 — Yedek ve mevcut durum (zorunlu, salt okunur)

1. Supabase Dashboard → **Database → Backups** bölümünden güncel bir yedek olduğundan emin olun.
2. SQL Editor'da `sql/00_mevcut_durum_kontrol.sql` dosyasını çalıştırın. Bu dosya hiçbir şeyi değiştirmez.
   SQL Editor yalnızca son sonucu gösterirse sorguları tek tek seçip çalıştırın.
3. Özellikle şunlara bakın:
   - **Sorgu 1:** Hangi tablolarda RLS açık?
   - **Sorgu 2:** Mevcut politikalar. `anon` veya `public` rolüne `true` koşuluyla açık politika var mı?
   - **Sorgu 5 ve 6:** `admin_assign_order` fonksiyonunun parametre tipleri ve içeriği. Müşteri RPC'lerinin `security_definer` değeri.
   - **Sorgu 9:** Mükerrer işletme adı veya site slug'ı var mı?
   - **Sorgu 10:** `time_proposal_status` alanında gerçekte hangi değerler kullanılıyor?

Bu çıktıyı bana gönderirseniz 04 ve 06 dosyalarını gerçek şemaya göre kesinleştirebilirim.

## Adım 1 — `sql/01_admin_yetki.sql` (önerilir, düşük risk)

- **Ne değişir:**
  - `is_admin()` ve `current_business_id()` fonksiyonları eklenir.
  - `profiles` tablosuna bir tetikleyici eklenir: admin olmayan kullanıcılar `role` veya `business_id` alanını değiştiremez, admin ya da işletme rolüyle profil oluşturamaz.
- **Neden:** Şu an bir kullanıcı `profiles` tablosunu güncelleyebiliyorsa kendini admin yapabilir ya da başka bir işletmeye bağlayabilir. Bu tetikleyici, RLS ne durumda olursa olsun bunu engeller.
- **Etkisi:** SQL Editor, Edge Function (service role) ve Supabase Auth'un kendi tetikleyicileri etkilenmez. Mevcut kodlarda kullanıcıların kendi rolünü değiştirdiği bir akış yok.
- **Doğrulama:** Panelde **Ayarlar ve altyapı → Sunucu tarafı admin doğrulaması** "Kurulu" görünmeli.

## Adım 2 — `sql/02_admin_rls_politikalari.sql` (önerilir, düşük risk)

- **Ne değişir:**
  - `orders`, `businesses`, `sites` ve `site_businesses` tablolarına yalnızca adminler için okuma, ekleme ve güncelleme politikaları eklenir. Silme izni verilmez.
  - `profiles` tablosuna yalnızca adminler için okuma politikası eklenir.
  - Mevcut veride mükerrer kayıt yoksa işletme adı ve site slug'ı için büyük/küçük harf duyarsız benzersiz indeksler oluşturulur.
- **Etkisi:**
  - Politikalar mevcut erişimi azaltmaz; yalnızca adminlere erişim ekler.
  - Mükerrer kayıt varsa indeks oluşturulmaz ve "NOTICE" mesajıyla bildirilir.

## Adım 3 — `sql/03_islem_gunlugu.sql` (önerilir)

- **Ne değişir:** Yeni bir `admin_audit_log` tablosu ve beş tabloya (`orders`, `businesses`, `sites`, `site_businesses`, `profiles`) tetikleyiciler eklenir. Her ekleme, güncelleme ve silme işlemi; kimin yaptığı, eski ve yeni değerlerle birlikte kaydedilir.
- **Güvenlik:** Tarayıcıdan bu tabloya kimse yazamaz; yalnızca adminler okuyabilir.
- **Doğrulama:** Paneldeki **İşlem günlüğü** sayfası açılmalı. Bir siteyi düzenleyince kaydı görünmeli.

## Adım 4 — İşletme hesap servisi (Edge Function)

Yeni işletme hesabı oluşturmak, davet göndermek, mevcut kullanıcıyı bağlamak ve hesabı askıya almak için gereklidir.
**Service-role anahtarı tarayıcıya veya bu depoya hiçbir zaman konmaz.** Supabase bu anahtarı fonksiyonun sunucu ortamına kendisi sağlar.

Terminalde (bilgisayarınızda bir kez):

```bash
# 1) Supabase CLI kurulumu (macOS örneği; Windows/Linux için https://supabase.com/docs/guides/cli)
brew install supabase/tap/supabase

# 2) Giriş ve projeye bağlanma
supabase login
git clone https://github.com/nfcova/admin-paneli.git && cd admin-paneli
supabase link --project-ref ahvplyeunubpbtsdzldj

# 3) İzin verilen kaynaklar ve işletme paneli adresi (gizli değildir ama ortam değişkeni olarak tutulur)
supabase secrets set ALLOWED_ORIGINS=https://nfcova.github.io BUSINESS_PANEL_URL=https://nfcova.github.io/baksana-isletme/

# 4) Dağıtım
supabase functions deploy admin-business-account --no-verify-jwt
```

- **`--no-verify-jwt` neden kullanılıyor:** Fonksiyon her istekte kullanıcı oturumunu ve admin yetkisini **kendi içinde** doğruluyor. Bu bayrak, yeni `sb_publishable_…` anahtarlarıyla ağ geçidindeki eski JWT doğrulamasının çakışmasını önler. Admin olmayan her istek 401 veya 403 ile reddedilir.
- **Otomatik ortam değişkenleri:** `SUPABASE_URL` ve `SUPABASE_SERVICE_ROLE_KEY` değişkenlerini Supabase sağlar; elle eklemeyin.
- **Doğrulama:** Panelde **Ayarlar ve altyapı → İşletme hesap servisi** "Kurulu" görünmeli. Ardından bir işletmenin detay sayfasındaki "Giriş hesapları" bölümü açılmalı.

## Adım 5 — Authentication ayarları (davet e-postası için)

- **Dashboard → Authentication → URL Configuration:**
  - "Site URL" ayarlı olmalı.
  - "Redirect URLs" listesine `https://nfcova.github.io/baksana-isletme/` eklenmeli.
- **Davet e-postaları:** Supabase'in yerleşik e-posta servisi saatlik düşük bir sınıra sahip. Düzenli kullanım için **Authentication → SMTP Settings** bölümünden kendi SMTP sağlayıcınızı tanımlayın. Bunu yapmadan da panelde "Geçici şifre oluştur" seçeneği çalışır.
- **İşletme panelinde ilk şifre belirleme:** İşletme panelinde henüz "şifre belirle" ekranı yok. Davetle gelen kullanıcı bağlantıya tıkladığında oturum açılır, ancak şifre belirleme adımı eklenene kadar **geçici şifre yöntemini** kullanmanız daha güvenilir olur.

## Adım 6 — `sql/04_admin_assign_order.sql` (00 çıktısını inceledikten sonra)

- **Ne değişir:** `admin_assign_order` fonksiyonu, kuralları açıkça uygulayan bir sürümle değiştirilir:
  - Çağıran admin olmalı.
  - Sipariş satırı kilitlenir; böylece işletmenin kabul etmesi veya müşterinin iptal etmesiyle aynı anda çakışmaz.
  - Yalnızca "Beklemede" durumundaki siparişler atanabilir.
  - Hedef işletme aktif olmalı ve siparişin sitesine aktif bağlı olmalı.
- **Önemli:** İşletme değişirken önceki işletmenin yanıt bekleyen saat önerisi temizlenir.
- **Güvenlik ağı:** Mevcut fonksiyonun parametre tipleri `(bigint, bigint)` değilse dosya hiçbir şey değiştirmeden durur. Bu durumda 00 çıktısını bana gönderin.

## Adım 7 — `sql/05_isletme_siparis_korumasi.sql` (önerilir)

- **Ne değişir:** İşletme kullanıcılarının sipariş güncellemeleri sunucu tarafında denetlenir:
  - Yalnızca kendi siparişlerini güncelleyebilirler.
  - Yalnızca durum ve saat önerisi alanlarını değiştirebilirler.
  - Yalnızca izinli durum geçişlerini yapabilirler.
  - Müşteri yanıtı bekleyen bir öneri varken siparişi kabul edemezler.
- **Etkisi:** İşletme panelinin bugün gönderdiği tüm güncellemeler bu kurallara uyar. Müşteri RPC'leri ve adminler etkilenmez.

## Adım 8 — `sql/06_rls_etkinlestirme.sql` (en son; 00 çıktısı incelendikten sonra)

- **Ne değişir:**
  - Beş tabloda RLS açılır.
  - İşletmelere yalnızca kendi verilerini okuma ve güncelleme izni veren politikalar eklenir.
  - Giriş yapmamış istemcilerin tablolara doğrudan erişimi kapanır.
- **Güvenlik ağları:**
  - Müşteri sitesinin kullandığı RPC'ler `SECURITY DEFINER` değilse dosya durur.
  - 01 ve 02 çalıştırılmamışsa dosya durur.
- **Riskler:**
  - Mevcut politikalar silinmez. `anon` rolüne açık eski politikalar varsa NOTICE ile listelenir; bunlar ayrıca kapatılmalıdır.
  - Bu adımdan sonra müşteri sitesi, işletme paneli ve admin paneli mutlaka test edilmelidir (aşağıdaki liste).
- **Acil geri alma:** `alter table public.<tablo> disable row level security;`

---

## SQL sonrası doğrulama testleri

**Admin paneli**
1. Admin hesabıyla giriş yapılabiliyor.
2. İşletme hesabıyla giriş denendiğinde "yönetici yetkisine sahip değil" mesajı çıkıyor.
3. **Ayarlar ve altyapı** sayfasında üç bileşen de "Kurulu" görünüyor.
4. Yeni bir site oluşturulabiliyor ve aynı slug ile ikinci bir site oluşturulamıyor.
5. Sihirbazla yeni bir işletme oluşturulabiliyor: siteye bağlanıyor ve geçici şifreli hesap açılıyor.
6. Aynı adla ikinci bir işletme oluşturulamıyor.
7. "Beklemede" bir sipariş, aynı sitedeki başka bir işletmeye yeniden atanabiliyor. Kabul edilmiş bir sipariş atanamıyor.
8. İşlem günlüğünde yukarıdaki işlemler görünüyor.

**İşletme paneli**

9. Yeni oluşturulan hesapla giriş yapılabiliyor ve yalnızca kendi siparişleri görünüyor.
10. Kabul, ret, saat önerisi, işi başlatma ve tamamlama akışları çalışıyor.
11. Müşteri yanıtı bekleyen bir öneri varken kabul edilemiyor.

**Müşteri sitesi**

12. `?site=<slug>` adresi açılıyor.
13. Sipariş oluşturulabiliyor.
14. Sipariş takip edilebiliyor.
15. Saat önerisi kabul edilebiliyor veya reddedilebiliyor.
16. Sipariş iptal edilebiliyor.

**Güvenlik**

17. Giriş yapmadan (anon anahtarla) `orders` tablosuna doğrudan erişim reddediliyor (06 sonrası).
18. İşletme kullanıcısı kendi `profiles.role` alanını değiştirmeye çalıştığında hata alıyor (01 sonrası).
19. İşletme kullanıcısı başka bir işletmenin siparişini göremiyor (06 sonrası).

---

## Opsiyonel (henüz uygulanmadı — ihtiyaç halinde birlikte tasarlayalım)

- **Hizmetleri veritabanına taşımak:** Hizmet listesi şu an müşteri sitesinin kodunda sabit. Panelden hizmet ekleyip düzenlemek için şunlar gerekir:
  - Bir `services` tablosu.
  - Müşteri sitesinin bu tablodan okuması.
  - `create_public_order` fonksiyonunun güncellenmesi.

  Bu, müşteri sitesinde değişiklik gerektirdiği için bu çalışmaya dahil edilmedi.
- **İşletmenin birden fazla hizmet vermesi:** `business_services(business_id, service)` gibi bir eşleştirme tablosu ve buna uygun yönlendirme kuralı gerekir.
- **İşletme adresi:** `businesses` tablosunda adres sütunu yok. `alter table public.businesses add column address text;` ile eklenebilir; ardından panelde düzenleme alanı açılır.
- **Finans altyapısı:** Sipariş fiyatı, tahsilat ve komisyon üç ayrı kavramdır. Önerilen tasarım:
  - `commission_rules`: işletme veya kategori bazında oran ve geçerlilik tarihi.
  - `payments`: sipariş, tutar, yöntem, tahsil eden, tarih ve durum.
  - Komisyonun sipariş tamamlandığında hesaplanıp `order_financials` tablosuna sabitlenmesi.

  Oranlar ve tahsilat modeli sizin iş kararınız olduğu için tahmini değerle uygulanmadı.
