/**
 * Yönetici ayarlarının tanımları: alanlar, varsayılanlar ve doğrulama.
 * Gizli alanlar (secret) veritabanında AES-256-GCM ile şifreli tutulur ve
 * yönetim ekranına yalnızca "tanımlı · ••••1234" olarak döner.
 */

export type FieldType = 'text' | 'number' | 'boolean' | 'select' | 'secret' | 'textarea';
export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  hint?: string;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  required?: boolean;
  placeholder?: string;
}

// ---------------------------------------------------------------- Genel

export interface GeneralSettings {
  supportEmail: string;
  supportPhone: string;
  platformFeeBps: number;
  vatRateBps: number;
  paymentLinkDays: number;
  maxListingPhotos: number;
  defaultCobrokeShare: number;
  onlineWindowMinutes: number;
  announcement: string;
}

export const GENERAL_FIELDS: FieldDef[] = [
  { key: 'supportEmail', label: 'Destek e-postası', type: 'text', placeholder: 'destek@emlook.com.tr' },
  { key: 'supportPhone', label: 'Destek telefonu', type: 'text', placeholder: '0850 000 00 00' },
  { key: 'platformFeeBps', label: 'Platform hizmet bedeli (on binde)', type: 'number', min: 0, max: 3000, hint: '500 = %5. Yeni ödeme taleplerine uygulanır.' },
  { key: 'vatRateBps', label: 'KDV oranı (on binde)', type: 'number', min: 0, max: 5000, hint: '2000 = %20' },
  { key: 'paymentLinkDays', label: 'Ödeme bağlantısı geçerlilik (gün)', type: 'number', min: 1, max: 60 },
  { key: 'maxListingPhotos', label: 'İlan başına en fazla fotoğraf', type: 'number', min: 1, max: 60 },
  { key: 'defaultCobrokeShare', label: 'Varsayılan ortak satış payı (%)', type: 'number', min: 0, max: 100 },
  { key: 'onlineWindowMinutes', label: '"Çevrimiçi" sayılma süresi (dakika)', type: 'number', min: 1, max: 60, hint: 'Son görülme bu süre içindeyse çevrimiçi sayılır.' },
  { key: 'announcement', label: 'Duyuru bandı', type: 'textarea', hint: 'Boş bırakılırsa gösterilmez.' },
];

// ---------------------------------------------------------------- Rozetler

export interface BadgeTier {
  key: string;
  label: string;
  minScore: number;
  /** Emlook paletinden: brand, ink, ok, warn, gold, silver, bronze */
  color: string;
}
export interface BadgeSettings {
  weights: Record<BadgeMetric, number>;
  tiers: BadgeTier[];
}
export const BADGE_METRICS = [
  'activeListing',
  'soldListing',
  'eidsVerified',
  'match',
  'likeReceived',
  'follower',
  'paidPayment',
  'accountMonth',
  'profileComplete',
] as const;
export type BadgeMetric = (typeof BADGE_METRICS)[number];
export const BADGE_METRIC_LABELS: Record<BadgeMetric, string> = {
  activeListing: 'Yayındaki ilan başına',
  soldListing: 'Satılan / kiralanan ilan başına',
  eidsVerified: 'EİDS doğrulanmış ilan başına',
  match: 'Eşleşme (kabul edilen ilgi) başına',
  likeReceived: 'Alınan beğeni başına',
  follower: 'Takipçi başına',
  paidPayment: 'Tahsil edilen ödeme başına',
  accountMonth: 'Platformdaki her ay için',
  profileComplete: 'Profil tamam (fotoğraf + tanıtım) bir kez',
};

// ---------------------------------------------------------------- Entegrasyonlar

export const INTEGRATIONS = ['netgsm', 'smtp', 'trinkle360', 'fcm', 's3', 'eids', 'efatura'] as const;
export type IntegrationName = (typeof INTEGRATIONS)[number];

export interface IntegrationDef {
  name: IntegrationName;
  title: string;
  category: 'Bildirim' | 'Ödeme' | 'Depolama' | 'Resmî servis';
  description: string;
  /** live: ayar kaydedilince hemen kullanılır · restart: API yeniden başlayınca · pending: entegrasyon kodu bekleniyor */
  apply: 'live' | 'restart' | 'pending';
  testable: boolean;
  fields: FieldDef[];
}

const enabled: FieldDef = { key: 'enabled', label: 'Etkin', type: 'boolean', hint: 'Kapalıysa sunucu ortam değişkenlerindeki ayar kullanılır.' };

export const INTEGRATION_DEFS: Record<IntegrationName, IntegrationDef> = {
  netgsm: {
    name: 'netgsm',
    title: 'Netgsm SMS',
    category: 'Bildirim',
    description: 'Giriş doğrulama kodları ve SMS bildirimleri.',
    apply: 'live',
    testable: true,
    fields: [
      enabled,
      { key: 'userCode', label: 'Kullanıcı kodu', type: 'text', required: true, placeholder: '850XXXXXXX' },
      { key: 'password', label: 'API parolası', type: 'secret', required: true },
      { key: 'header', label: 'Mesaj başlığı', type: 'text', required: true, placeholder: 'EMLOOK', hint: 'BTK onaylı gönderici adı' },
      { key: 'useOtpEndpoint', label: 'OTP paketi', type: 'boolean', hint: 'Hızlı OTP hattını kullanır (paketiniz varsa).' },
      { key: 'baseUrl', label: 'API adresi', type: 'text', placeholder: 'https://api.netgsm.com.tr' },
    ],
  },
  smtp: {
    name: 'smtp',
    title: 'E-posta (SMTP)',
    category: 'Bildirim',
    description: 'Parola yenileme ve bilgilendirme e-postaları.',
    apply: 'live',
    testable: true,
    fields: [
      enabled,
      { key: 'host', label: 'SMTP sunucusu', type: 'text', required: true, placeholder: 'smtp.ornek.com' },
      { key: 'port', label: 'Port', type: 'number', min: 1, max: 65535, placeholder: '587' },
      { key: 'secure', label: 'SSL/TLS (465)', type: 'boolean' },
      { key: 'user', label: 'Kullanıcı adı', type: 'text' },
      { key: 'pass', label: 'Parola', type: 'secret' },
      { key: 'from', label: 'Gönderen', type: 'text', placeholder: 'Emlook <no-reply@emlook.com.tr>' },
    ],
  },
  trinkle360: {
    name: 'trinkle360',
    title: 'Trinkle360 ödeme',
    category: 'Ödeme',
    description: 'Komisyon tahsilatı, alt üye işyeri ve split ödeme.',
    apply: 'pending',
    testable: false,
    fields: [
      enabled,
      { key: 'environment', label: 'Ortam', type: 'select', options: [{ value: 'test', label: 'Test' }, { value: 'live', label: 'Canlı' }] },
      { key: 'merchantId', label: 'Üye işyeri no', type: 'text', required: true },
      { key: 'apiKey', label: 'API anahtarı', type: 'secret', required: true },
      { key: 'secretKey', label: 'Gizli anahtar', type: 'secret', required: true },
      { key: 'webhookSecret', label: 'Webhook imza anahtarı', type: 'secret' },
      { key: 'baseUrl', label: 'API adresi', type: 'text' },
    ],
  },
  fcm: {
    name: 'fcm',
    title: 'Firebase bildirimleri (FCM)',
    category: 'Bildirim',
    description: 'Mobil uygulamaya anlık bildirim.',
    apply: 'restart',
    testable: true,
    fields: [
      enabled,
      { key: 'projectId', label: 'Proje kimliği', type: 'text', placeholder: 'emlook-prod' },
      { key: 'serviceAccount', label: 'Servis hesabı JSON', type: 'secret', required: true, hint: 'Firebase konsolundan indirilen JSON dosyasının içeriği' },
    ],
  },
  s3: {
    name: 's3',
    title: 'Dosya depolama (S3 / R2)',
    category: 'Depolama',
    description: 'İlan fotoğrafları, belgeler ve profil resimleri.',
    apply: 'restart',
    testable: true,
    fields: [
      enabled,
      { key: 'bucket', label: 'Kova (bucket)', type: 'text', required: true },
      { key: 'region', label: 'Bölge', type: 'text', placeholder: 'auto' },
      { key: 'endpoint', label: 'Uç nokta', type: 'text', placeholder: 'https://<hesap>.r2.cloudflarestorage.com' },
      { key: 'accessKeyId', label: 'Erişim anahtarı', type: 'text', required: true },
      { key: 'secretAccessKey', label: 'Gizli erişim anahtarı', type: 'secret', required: true },
      { key: 'forcePathStyle', label: 'Path-style (MinIO)', type: 'boolean' },
      { key: 'prefix', label: 'Önek', type: 'text', placeholder: 'prod/' },
    ],
  },
  eids: {
    name: 'eids',
    title: 'EİDS Taşınmaz doğrulama',
    category: 'Resmî servis',
    description: 'Ticaret Bakanlığı Elektronik İlan Doğrulama Sistemi.',
    apply: 'pending',
    testable: false,
    fields: [
      enabled,
      { key: 'mode', label: 'Doğrulama yöntemi', type: 'select', options: [{ value: 'manual', label: 'Yönetici elle doğrular' }, { value: 'api', label: 'EİDS API' }] },
      { key: 'apiUrl', label: 'API adresi', type: 'text' },
      { key: 'clientId', label: 'İstemci kimliği', type: 'text' },
      { key: 'clientSecret', label: 'İstemci sırrı', type: 'secret' },
    ],
  },
  efatura: {
    name: 'efatura',
    title: 'e-Fatura / e-Arşiv',
    category: 'Resmî servis',
    description: 'Platform hizmet bedeli faturaları.',
    apply: 'pending',
    testable: false,
    fields: [
      enabled,
      { key: 'provider', label: 'Entegratör', type: 'select', options: ['Uyumsoft', 'Logo', 'Foriba (Sovos)', 'İzibiz', 'Diğer'].map((v) => ({ value: v, label: v })) },
      { key: 'vkn', label: 'VKN', type: 'text' },
      { key: 'username', label: 'Kullanıcı adı', type: 'text' },
      { key: 'password', label: 'Parola', type: 'secret' },
      { key: 'testMode', label: 'Test ortamı', type: 'boolean' },
      { key: 'invoicePrefix', label: 'Fatura seri öneki', type: 'text', placeholder: 'EML' },
    ],
  },
};
