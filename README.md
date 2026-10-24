# Emlook

Emlakçıların portföy paylaştığı, eşleştiği ve komisyonunu online tahsil ettiği sosyal ağ.

| Uygulama | Teknoloji | Klasör |
| --- | --- | --- |
| API | NestJS 12, Drizzle ORM, PostgreSQL | `apps/api` |
| Web (danışman + admin paneli) | Next.js 16, Tailwind CSS 4, TanStack Query | `apps/web` |
| Mobil (iOS + Android) | Flutter | `apps/mobile` |

## Gereksinimler

- Node.js 22+ ve pnpm 10 (`npm i -g pnpm`)
- Docker Desktop (PostgreSQL ve Redis için)
- Flutter SDK + Android Studio (mobil için)

## Kurulum

```bash
pnpm install
docker compose up -d                 # PostgreSQL 16 + PostGIS, Redis

cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local

pnpm db:migrate                      # tabloları oluşturur
pnpm db:seed                         # ADMIN_PHONES'taki numaraları yönetici yapar
```

## Çalıştırma

```bash
pnpm dev:api                         # http://localhost:3000/api/v1  · Swagger: /docs
pnpm dev:web -- -p 3001              # http://localhost:3001
```

Geliştirmede SMS gönderilmez; giriş kodu API'nin konsol çıktısına yazılır
(`Emlook giris kodunuz: 123456`).

Mobil (Android emülatörü, API bilgisayarda çalışırken):

```bash
cd apps/mobile
flutter pub get
flutter run                          # API adresi varsayılan: http://10.0.2.2:3000/api/v1
# Gerçek cihaz veya farklı sunucu için:
flutter run --dart-define=API_URL=http://192.168.1.20:3000/api/v1
```

## Testler

```bash
pnpm --filter api test               # birim testleri
pnpm --filter api test:e2e           # gerçek PostgreSQL ile uçtan uca (emlook_test veritabanı)
pnpm --filter web lint
cd apps/mobile && flutter analyze && flutter test
```

## Veritabanı değişiklikleri

1. `apps/api/src/db/schema.ts` dosyasını düzenle
2. `pnpm --filter api db:generate --name <aciklama>` ile SQL migration üret
3. Üretilen dosyayı `apps/api/drizzle/` altında incele ve commit'le
4. `pnpm db:migrate`

## Mimari notlar

- **Oturum:** Telefon + OTP. API kısa ömürlü JWT erişim belirteci ve her kullanımda değişen
  yenileme belirteci verir; veritabanında yalnızca SHA-256 özeti tutulur. Her istekte oturum ve
  kullanıcı durumu kontrol edildiğinden çıkış ve askıya alma anında etkilidir.
- **Web:** Belirteçler httpOnly çerezlerde durur; tarayıcı yalnızca `/api/*` köprüsünü çağırır,
  köprü API'ye belirteçle iletir ve süresi dolan belirteci yeniler.
- **Mobil:** Belirteçler cihazın güvenli deposunda (Keystore / Keychain).
- **Belgeler:** Dosya türü uzantıdan değil içerik imzasından belirlenir; belgeler herkese açık
  URL ile sunulmaz, yalnızca sahibi ve yöneticiler görebilir.
- **KVKK:** Rızalar sürümüyle, IP ve tarayıcı bilgisiyle yalnızca eklenen kayıtlar olarak tutulur.

Ürün kapsamı, risk analizi ve yol haritası için bkz. `CLAUDE.md`.
