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

## Durum
- **E1 API tamam:** auth (OTP, refresh, logout), onboarding + rızalar, danışman başvurusu, belge yükleme, admin onay/ret, denetim kaydı. 20 e2e + 16 birim testi.
- **Web tamam (E1):** giriş, kayıt, danışman başvuru ekranı, admin başvuru listesi/detay/onay. Belirteçler httpOnly çerezde; `src/app/api/*` köprüsü.
- **Mobil (E1):** giriş, kod, kayıt, ana sayfa, başvuru + belge yükleme (Flutter, go_router, dio, flutter_secure_storage, file_picker).
- Web, Next.js 16 kullanıyor: kod yazmadan önce `apps/web/node_modules/next/dist/docs/` altındaki ilgili rehbere bak (bkz. `apps/web/AGENTS.md`).

## Sıradaki
1. E2 Ofis hesabı: ofis oluşturma, "Sahip" rozeti, davet / katılma talebi, onay, transfer ve bildirimler
2. Gerçek SMS sağlayıcısı (Netgsm / İleti Merkezi) ve S3 uyumlu depolama sürücüsü
3. KVKK aydınlatma ve kullanım koşulları nihai metinleri (şu an yer tutucu)
4. E3 Portföy + EİDS entegrasyonu (başvuru sonucu bekleniyor)

## Komutlar
```
docker compose up -d          # PostgreSQL + Redis
pnpm install
pnpm --filter api db:migrate
pnpm dev:api                  # http://localhost:3000/api/v1, Swagger: /docs
pnpm --filter api test:e2e
```

## Açık konular
Trinkle360 lisans ve split ödeme kabiliyeti, EİDS Taşınmaz API entegrasyon başvurusu, fatura modeli (kim keser) — ödeme modülüne başlamadan netleşmeli.
