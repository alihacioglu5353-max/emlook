# Emlook — proje rehberi

Emlakçıların portföy paylaştığı, eşleştiği ve komisyonunu online tahsil ettiği B2B sosyal ağ.
Ürün analizi, risk matrisi ve yol haritası: https://claude.ai/artifact/96KkpehXvPF9vTPaf8C35N

## Alınan kararlar
- **Monorepo (pnpm workspace):** `apps/api` (NestJS 12, ESM), `apps/web` (Next.js), `apps/mobile` (Flutter), `packages/*`.
- **Backend:** NestJS 12 + TypeScript, modüler monolit. ESM: göreli importlar `.js` uzantısıyla yazılır.
- **Veritabanı:** PostgreSQL 16 (+PostGIS ileride). ORM: **Drizzle** (Prisma, ikili motor gerektirdiği için bırakıldı).
  Şema `apps/api/src/db/schema.ts`; migration'lar `apps/api/drizzle/` altında SQL olarak tutulur.
- **Test:** Vitest. Birim testler `*.spec.ts`, e2e testler `test/*.e2e-spec.ts` (gerçek PostgreSQL, `emlook_test` veritabanı).
- **Lint:** oxlint.
- **Dil:** Kullanıcıya dönen mesajlar ve yorumlar Türkçe; kod tanımlayıcıları İngilizce.

## MVP kapsamı (v1.0, hedef Nisan 2027)
E1 Kimlik ve onay · E2 Ofis hesabı · E3 Portföy (EİDS) · E4 Akış · E5 Keşfet/eşleşme · E6 Arama ·
E7 Mesajlaşma/bildirim · E8 Ödeme (Trinkle360) · E9 Admin paneli.
v1.1 ve v2.0 özellikleri (abonelik, Look/video, AI, reklam) MVP'ye alınmaz.

## E1 tasarımı (devam ediyor)
- Giriş ve kayıt tek akış: telefon → OTP (`/api/v1/auth/otp/request`, `/otp/verify`). Kullanıcı yoksa oluşturulur, `role = null`.
- Onboarding (`/me/onboarding`): ad soyad, hesap tipi (`agent` | `consumer`), KVKK aydınlatma + kullanım koşulları rızası (sürümlü, yalnızca eklenen kayıtlar).
- Danışman: profil (yetki belgesi no, unvan, il/ilçe) + belge yükleme (`authority_certificate` zorunlu) → `submit` → `pending`.
- Admin: bekleyen başvuruları listeler, belgeyi görür, onaylar/reddeder (gerekçeli). Onaylı danışman rozeti `verification_status = approved`.
- Oturum: kısa ömürlü JWT erişim belirteci (`sub`, `sid`) + dönen (rotation) yenileme belirteci; DB'de yalnızca SHA-256 özeti.
  `JwtAuthGuard` her istekte oturum ve kullanıcı durumunu DB'den kontrol eder (çıkış/askıya alma anında etkili).
- OTP: HMAC-SHA256 özet, 3 dk ömür, 5 deneme, 60 sn yeniden gönderim, saatte 5 kod. SMS sağlayıcısı soyut (`console`, `memory`; üretim için Netgsm/İleti Merkezi eklenecek).
- Denetim kaydı: onay/ret/onboarding işlemleri `audit_logs` tablosuna yazılır.

## E2 tasarımı (ofis hesabı)
- Yalnızca **onaylı danışman** ofis açar/katılır. Ofis `pending` → admin onayı → `active`; reddedilirse sahip bağımsıza döner.
- `office_memberships.status`: `requested` (danışman talebi) · `invited` (ofis daveti) · `active` · `declined` · `cancelled` · `left` · `removed`.
  Kısmi benzersiz indeksler: kullanıcı başına tek `active`; ofis+kullanıcı başına tek açık kayıt.
- Transfer: başka ofisteyken talep/davet aktifleşirse eski üyelik `left` olur, eski ofisin sahip/yöneticilerine bildirim gider; diğer açık talepler geri çekilir.
  Eşzamanlı aktifleşmede benzersizlik ihlali `CONCURRENT_CHANGE` (409) olarak döner.
- Roller: `owner` (tek; ayrılamaz, önce sahiplik devri) · `manager` (talep/davet, danışman çıkarma) · `agent`.
- Bildirimler: `notifications` tablosu + `NotificationsService.notify(items, tx)` — E7'de push buradan tetiklenecek.
- Mobilde ofis açma ve ekip yönetimi yok (web paneli); mobil: durum, davet kabul/ret, arama + talep, ayrılma, bildirim listesi.

## E3 tasarımı (portföy)
- Konum verisi: `cities` (plaka kodu) → `districts` → `neighbourhoods` (81 il, 973 ilçe, 73.300 mahalle/köy; `turkey-neighbourhoods`, MIT).
  Yükleme: `pnpm --filter api db:seed-locations` (yalnızca boşsa). Uç noktalar `@Public`: `/locations/cities`, `/cities/:code/districts`, `/districts/:id/neighbourhoods`.
- İlan yaşamı: `draft` → `active` ↔ `passive` → `sold`; `removed` yalnızca yönetici (E9). Yalnızca taslak silinir.
  Yayın şartı: ≥1 fotoğraf + EİDS `verified` (veya `isDemo`). Doğrulanmış taşınmaz numarası kilitlenir (`EIDS_LOCKED`).
- EİDS soyut: `EIDS_PROVIDER=mock` (geliştirme/test; `...0000` ile biten numara başarısız) · `manual` (üretim varsayılanı, `pending`, yönetici onaylar).
- Görünürlük (`listing-cards.ts › visibleTo`): `public` herkes · `agents` danışmanlar · `network` takipçiler + aynı ofis. Mülk sahibi `cobrokeShare` görmez.
- `listingCards()` akış/keşfet/arama için ortak kart sorgusu; `search_text` E6 araması için Türkçe karakterleri sadeleştirilmiş metin.
- PATCH'te isteğe bağlı alanlar `null` ile temizlenir; ilçe değişip mahalle gönderilmezse mahalle sıfırlanır.
- Web: `/panel/portfoy` (liste, sekmeler), `/panel/portfoy/yeni`, `/panel/portfoy/[id]` (fotoğraf, EİDS, yayın), `/ilan/[id]` (detay, tüm roller).
  Fotoğraflar `/api/backend` köprüsünden; görseller tarayıcıda 1 saat özel önbellekte.

## Durum
- **E1 API tamam:** auth (OTP, refresh, logout), onboarding + rızalar, danışman başvurusu, belge yükleme, admin onay/ret, denetim kaydı. 20 e2e + 16 birim testi.
- **Web tamam (E1):** giriş, kayıt, danışman başvuru ekranı, admin başvuru listesi/detay/onay. Belirteçler httpOnly çerezde; `src/app/api/*` köprüsü.
- **Mobil (E1) tamam:** giriş, kod, kayıt, ana sayfa, başvuru + belge yükleme (Flutter 3.47, go_router 18, dio 5, flutter_secure_storage 11, file_picker 13 — `FilePicker.pickFiles` statiktir ve liste döndürür). `flutter analyze` temiz, testler geçiyor.
- **E2 tamam (API, web, mobil):** ofis açma + admin onayı, arama/profil, talep, davet, transfer, roller, çıkarma, ayrılma, sahiplik devri, bildirimler. Toplam 28 e2e testi.
- **E3 tamam (API, web):** ilan girişi, konum, fotoğraf, EİDS soyutlaması, yayın kuralları, görünürlük. Toplam 35 e2e testi. Mobil ekranlar en sona.
- **CI:** GitHub Actions ile API (lint, tip, birim, e2e), web (lint, build) ve mobil (analyze, test) işleri yeşil.
- Web, Next.js 16 kullanıyor: kod yazmadan önce `apps/web/node_modules/next/dist/docs/` altındaki ilgili rehbere bak (bkz. `apps/web/AGENTS.md`).

## Sıradaki
1. E4 Akış → E5 Keşfet → E6 Arama → E7 Mesajlaşma → E8 Ödeme → E9 Admin; mobil ekranlar ve testleri en sonda
2. Gerçek SMS sağlayıcısı (Netgsm / İleti Merkezi) ve S3 uyumlu depolama sürücüsü
3. KVKK aydınlatma ve kullanım koşulları nihai metinleri (şu an yer tutucu)
4. E7 push bildirimleri (FCM/APNs) — `NotificationsService.notify` üzerinden

## Komutlar
```
docker compose up -d          # PostgreSQL (port 5433) + Redis
pnpm install
pnpm --filter api db:migrate
pnpm --filter api db:seed-locations   # il/ilçe/mahalle (bir kez)
pnpm dev:api                  # http://localhost:3000/api/v1, Swagger: /docs
pnpm --filter api test:e2e
```

## Geliştirme ortamı notları
- Docker PostgreSQL **5433** portunda (Windows makinelerdeki yerel PostgreSQL 5432 ile çakışmasın diye).
- Android emülatörü yerel API'ye `http://10.0.2.2:3000/api/v1` ile bağlanır; şifresiz HTTP yalnızca debug manifestinde açık.
- `NODE_ENV=production` miras alınan bir süreçte API kısa geliştirme anahtarlarını reddeder; `NODE_ENV=development` verin.

## Açık konular
Trinkle360 lisans ve split ödeme kabiliyeti, EİDS Taşınmaz API entegrasyon başvurusu, fatura modeli (kim keser) — ödeme modülüne başlamadan netleşmeli.
