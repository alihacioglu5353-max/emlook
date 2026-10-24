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
- OTP: HMAC-SHA256 özet, 3 dk ömür, 5 deneme, 60 sn yeniden gönderim, saatte 5 kod. SMS sağlayıcısı soyut (`console`, `memory`, `netgsm`); gönderim hatasında kod silinir, 503 `SMS_FAILED`.
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

## E4 tasarımı (akış)
- `feed/` modülü. `GET /feed?scope=all|network&dealType=&cursor=`: Emlook Ağı = görebildiğin tüm yayındaki ilanlar; Benim Ağım = takip + aynı ofis.
  Kendi ilanların ve askıdaki danışmanların ilanları hariç. Sıra `(published_at, id)` azalan; imleç base64url `iso|id` (`feed/cursor.ts`).
- Takip yalnızca danışmana (`POST/DELETE /agents/:id/follow`); mülk sahibi de takip edebilir. Listeler: `/users/:id/followers|following`. Öneriler: `/me/suggestions` (ofis > il > ilan sayısı).
- Beğeni/kaydetme idempotent, yalnızca yayındaki ilan (`/listings/:id/like|save`); `GET /me/saved` hâlâ görünenler. Yeni takip/beğeni → bildirim (`social.followed`, `listing.liked`).
- Web: `(app)` rota grubu (tüm roller): `/akis`, `/ilan/[id]`, `/danisman/[id]`, `/kaydedilenler`. `ListingGrid` (useInfiniteQuery), `Reactions`, `FollowButton`.

## E5 tasarımı (keşfet ve eşleşme)
- `discover/` modülü. `GET /discover?dealType&cityCode`: karar verilmemiş, görebildiğin yayındaki ilanlar; kural tabanlı puan
  (profil ili +30, ilçesi +20, ağ +15, EİDS +10, 3+ foto +5, paylaşım/10 danışmana, tazelik 0–30).
- `listing_swipes` (kullanıcı+ilan benzersiz): `POST /discover/:id/swipe {like|pass, note?}`; like → `interests` (el sıkışma) + bildirim.
  `POST /discover/undo` son kararı 10 dk içinde geri alır (bekleyen ilgi `withdrawn`).
- `interests`: `pending → accepted | declined | withdrawn`; ilan+kişi başına tek açık/kabul edilmiş kayıt (kısmi benzersiz indeks).
  Detaydan `POST /listings/:id/interest`; `GET /interests/incoming|outgoing` (sayılarla); sahip kabul/ret, talep eden geri çeker.
  Kabul = eşleşme → E7'de konuşma buradan açılacak. Mülk sahipleri de ilgi gösterebilir (alıcı adayı).
- Web: `/kesfet` (sürükle/klavye ← →, geri al), `/talepler` (Gelen / Gönderdiğim), ilan detayında "İlgileniyorum".

## E6 tasarımı (arama)
- `search/parse-query.ts`: serbest metin → il/ilçe (belirsiz ilçe adı yalnızca il ile), satılık/kiralık, kategori, oda, fiyat
  ("10 milyon altı", "20-35 bin", "15.000.000 tl üstü"; niteleyicisiz fiyat = bütçe üst sınırı), m² (±%15 veya sınır). Kalan kelimeler
  `search_text` içinde ILIKE (başlık, konum, kategori, açıklamanın ilk 1000 karakteri). İl/ilçe adları serviste bellekte.
- `GET /search`: açık parametreler ayrıştırılanların önüne geçer; `parsed` döner ("Anladığım" çipleri); toplam + offset sayfalama; sıralama yeni/fiyat.
- `GET /search/agents?q=`: ad, unvan, ofis; `translate()` ile Türkçe karakterden bağımsız.
- Migration 0004 (özel SQL): `pg_trgm` + `search_text` GIN indeksi — şemada tanımlı değil.
- Web: `/ara` (URL tek kaynak, paylaşılabilir), üst çubukta hızlı arama.

## E7 tasarımı (mesajlaşma ve push)
- `messaging/`: iki kişi arasında tek konuşma (`conversations.pair_key` = küçük:büyük kimlik), `conversation_participants.last_read_at`,
  `messages` (`text` | `listing` | `system`; `seq` bigserial = imleç; `created_at` clock_timestamp).
- Yazma kuralı: var olan konuşma · onaylı danışmana herkes · danışman yalnızca kendisine ilgi göstermiş mülk sahibine. Yönetici yazamaz.
- `GET /conversations` (son mesaj, okunmamış), `/conversations/unread`, `/with/:userId`, `POST /conversations {userId, listingId?, text?}`,
  `GET /:id/messages?cursor=|after=` (yoklama), `POST /:id/messages`, `POST /:id/read`. Eşleşmede `onMatch` konuşma + sistem mesajı.
- Gerçek zamanlı yok: web 4 sn'de bir `after` ile yoklar, liste 15 sn, rozet 30 sn. (Ölçek gelince SSE/WebSocket.)
- `push/`: `PushProvider` (`log` | `memory` | `fcm`), `/me/devices` kayıt/silme, geçersiz belirteç temizliği.
  `NotificationsService.notify` ve her mesaj `PushService.dispatch` ile arka planda push gönderir (testte `flush()`).
- İmleç notu: JS tarihi ms, Postgres µs → zaman imleçli sorgularda sütun `date_trunc('milliseconds', …)`.
- Eşzamanlılık: `isConcurrencyConflict` (23505, 40P01, 40001) → 409 `CONCURRENT_CHANGE`.
- Web: `/mesajlar` (iki bölme; mobilde tek), profil "Mesaj gönder", ilan "Danışmana mesaj gönder", talepte "Mesajlaş", menüde rozet.

## E8 tasarımı (ödeme)
- Tutarlar **kuruş** (bigint). `payments/money.ts`: `splitAmount` (platform bedeli on binde, kalan ilan/alıcı danışmanı; artık ilan danışmanında),
  `vatFromGross`, TR IBAN (mod 97), TCKN/VKN denetimi.
- `payout_accounts` (danışman IBAN → sağlayıcıda alt üye işyeri). Hesapsız danışmanın payı `held`; hesap eklenince `settled`.
- `payment_requests`: danışman oluşturur (onaylı IBAN şart), herkese açık `public_token` bağlantısı (`/odeme/:token`), varsayılan 7 gün,
  okuma anında süresi dolanlar `expired`. Alıcı danışman payı verilmezse ilandaki `cobroke_share`.
- `PaymentProvider` soyut: `createCheckout`, `parseWebhook` (imza), `registerSubMerchant`. Şimdilik `MockPaymentProvider`
  (HMAC-SHA256 `x-emlook-signature`, web'de test ödeme ekranı + `/pay/:token/mock-complete`). Üretimde mock `ALLOW_MOCK_PAYMENTS=true` olmadan açılmaz.
- Webhook `POST /payments/webhook/:provider` ham gövdeyle (`rawBody: true`) doğrulanır; `payment_events (provider, event_id)` benzersiz → tekrar gelen olay bir kez işlenir.
  Tahsil edilen ödeme talep iptal/süresi geçmiş olsa da `paid` kaydedilir.
- Ödemede: `payment_splits` (platform, seller_agent, buyer_agent), platform bedeli için KDV ayrıştırılmış `invoices` (`pending`; e-Fatura kararı bekliyor), bildirimler.
- Ortam: `PAYMENT_PROVIDER`, `PAYMENT_WEBHOOK_SECRET` (üretimde ≥32), `PLATFORM_FEE_BPS` (500, yer tutucu), `VAT_RATE_BPS` (2000), `PAYMENT_LINK_DAYS`, `PUBLIC_WEB_URL`.
- Web: `/panel/odemeler` (özet, IBAN, talepler), `/yeni` (danışman arama, bölüşüm önizlemesi), `/[id]` (bağlantı kopyala, WhatsApp, iptal), herkese açık `/odeme/[token]`.

## E9 tasarımı (yönetim)
- `admin/ops.*`: `GET /admin/dashboard` (yapılacaklar + kullanıcı/portföy/etkileşim/ödeme göstergeleri), `/admin/users` (ad/telefon arama, rol/durum),
  `/admin/users/:id` (+ istatistik), `suspend {reason}` (oturumlar iptal; ilanlar akış/arama/detaydan gizlenir) / `reactivate`.
- İlan: `/admin/listings?q&status&eids`, `remove {reason}` (açık şikâyetler çözülür, sahibine bildirim), `restore` (pasif), `eids {verified|failed, message}`.
- Şikâyet: kullanıcı `POST /listings/:id/report {reason, note}` (kullanıcı+ilan başına tek açık); `/admin/reports?status`, `dismiss`.
- `/admin/payments?status` (platform bedeli, fatura durumu). Tüm işlemler `audit_logs`'a yazılır.
- Web: `/admin` özet, `/admin/basvurular`, `/ofisler`, `/kullanicilar(/[id])`, `/ilanlar`, `/sikayetler`, `/odemeler`; ilan detayında "Bu ilanı şikâyet et".

## Sağlayıcılar ve hukuki metinler
- **SMS:** `SMS_PROVIDER=netgsm` (`NETGSM_USERCODE/PASSWORD/HEADER`, `NETGSM_USE_OTP`); üretimde `console` yalnızca `ALLOW_CONSOLE_SMS=true` ile.
- **Depolama:** `STORAGE_DRIVER=local|s3` (AWS S3, Cloudflare R2, MinIO; `S3_*`). Dosyalar herkese açık URL ile sunulmaz, uç noktalar akıtır.
- **Push:** `PUSH_PROVIDER=fcm` + `FCM_SERVICE_ACCOUNT` (ham veya base64 JSON); HTTP v1, geçersiz belirteçler silinir. Mobilde Firebase kurulumu (google-services.json) bekliyor.
- **Hukuki metinler tek kaynak:** `apps/api/src/legal/legal.texts.ts` → `GET /legal`, `GET /legal/:slug` (`kvkk`, `kosullar`, `ticari-ileti`).
  Web `/kvkk`, `/kosullar`, `/ticari-ileti` (istek anında API'den), mobil `/yasal/:slug`. Şu an **taslak**: [ ] alanları ve "HUKUK NOTU"ları hukukçu tamamlamalı.
  Metin değişince `version` + `KVKK_CLARIFICATION_VERSION`/`TERMS_VERSION` birlikte güncellenir (uyuşmazsa API açılışta uyarır).
  KVKK İlke Kararı 2026/347: aydınlatma için "okudum ve anladım" (kabul değil); ticari ileti izni ayrı ve isteğe bağlı, web panel ve mobil profilden geri alınır (`PUT /me/consents/marketing`, sürüm = ticari-ileti metni).

## Durum
- **E1 API tamam:** auth (OTP, refresh, logout), onboarding + rızalar, danışman başvurusu, belge yükleme, admin onay/ret, denetim kaydı. 20 e2e + 16 birim testi.
- **Web tamam (E1):** giriş, kayıt, danışman başvuru ekranı, admin başvuru listesi/detay/onay. Belirteçler httpOnly çerezde; `src/app/api/*` köprüsü.
- **Mobil (E1) tamam:** giriş, kod, kayıt, ana sayfa, başvuru + belge yükleme (Flutter 3.47, go_router 18, dio 5, flutter_secure_storage 11, file_picker 13 — `FilePicker.pickFiles` statiktir ve liste döndürür). `flutter analyze` temiz, testler geçiyor.
- **E2 tamam (API, web, mobil):** ofis açma + admin onayı, arama/profil, talep, davet, transfer, roller, çıkarma, ayrılma, sahiplik devri, bildirimler. Toplam 28 e2e testi.
- **E3 tamam (API, web):** ilan girişi, konum, fotoğraf, EİDS soyutlaması, yayın kuralları, görünürlük. Toplam 35 e2e testi. Mobil ekranlar en sona.
- **E4 tamam (API, web):** akış (Emlook Ağı / Benim Ağım), takip, beğeni, kaydetme, öneriler, danışman profili. Toplam 39 e2e testi.
- **E5 tamam (API, web):** keşfet kartları, kaydırma, geri alma, ilgi/eşleşme akışı. Toplam 43 e2e testi.
- **E6 tamam (API, web):** serbest metin ayrıştırma, filtreler, sıralama, danışman araması. Toplam 47 e2e + 28 birim testi.
- **E7 tamam (API, web):** konuşmalar, ilan kartı paylaşımı, okunmamış, eşleşme konuşması, push soyutlaması ve cihaz kaydı. Toplam 51 e2e testi.
- **E8 tamam (API, web; test sağlayıcısıyla):** IBAN hesabı, ödeme talebi ve bağlantısı, split, imzalı webhook, fatura kaydı. Toplam 55 e2e testi.
- **E9 tamam (API, web):** yönetim özeti, kullanıcı askıya alma, ilan moderasyonu ve şikâyetler, EİDS elle doğrulama, ödeme listesi. Toplam 60 e2e + 32 birim testi.
- **Mobil E3–E8 tamam:** alt menülü kabuk (Akış/Keşfet/Ara/Mesajlar/Profil), portföy, ilan detay, keşfet, arama, talepler, mesajlar, ödemeler (CI'da analyze + test yeşil).
- **Sağlayıcılar tamam:** Netgsm SMS, S3 depolama, FCM push. **Hukuki metinler** taslak olarak yayında (62 e2e + 54 birim testi).
- **CI:** GitHub Actions ile API (lint, tip, birim, e2e), web (lint, build) ve mobil (analyze, test) işleri yeşil.
- Web, Next.js 16 kullanıyor: kod yazmadan önce `apps/web/node_modules/next/dist/docs/` altındaki ilgili rehbere bak (bkz. `apps/web/AGENTS.md`).

## Sıradaki
1. Bilgisayarda mobil doğrulama: `flutter pub get`, `flutter analyze`, `flutter test`, emülatörde uçtan uca deneme
2. Hukuk danışmanı incelemesi → metinlerde `draft: false`, şirket bilgileri
3. Firebase projesi + mobil push kaydı; Netgsm hesabı ve başlık onayı; S3/R2 kovası

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
- Trinkle360 lisans ve split ödeme kabiliyeti → gerçek `PaymentProvider` (şu an mock)
- Fatura modeli (kim keser) ve e-Fatura/e-Arşiv entegratörü → `invoices.status = issued`
- Platform hizmet bedeli oranı (`PLATFORM_FEE_BPS` şimdilik %5, yer tutucu)
- EİDS Taşınmaz API entegrasyon başvurusu → gerçek `EidsProvider`
