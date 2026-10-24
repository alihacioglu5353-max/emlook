import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const id = () =>
  uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`);
const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/**
 * agent    : emlak danışmanı (onay sürecinden geçer)
 * consumer : mülk sahibi / son kullanıcı (yalnızca görüntüler, talep bırakır)
 * admin    : Emlook yöneticisi
 */
export const userRole = pgEnum('user_role', ['agent', 'consumer', 'admin']);
export const userStatus = pgEnum('user_status', ['active', 'suspended']);

export const users = pgTable('users', {
  id: id(),
  phone: text('phone').notNull().unique(),
  email: text('email').unique(),
  fullName: text('full_name'),
  /** Kayıt (onboarding) tamamlanana kadar null kalır. */
  role: userRole('role'),
  status: userStatus('status').notNull().default('active'),
  /** Askıya alma gerekçesi (yönetici) */
  suspendedReason: text('suspended_reason'),
  suspendedAt: timestamp('suspended_at', { withTimezone: true }),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  /** E-posta ile giriş: scrypt özeti (parola hiç saklanmaz); null = parola yok */
  passwordHash: text('password_hash'),
  passwordUpdatedAt: timestamp('password_updated_at', { withTimezone: true }),
  /** Art arda hatalı parola denemesi; eşik aşılınca hesap kısa süre kilitlenir */
  failedLogins: integer('failed_logins').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  /** Profil fotoğrafı (depolama anahtarı) veya hazır avatar kimliği; ikisi aynı anda dolu olmaz */
  avatarKey: text('avatar_key'),
  avatarPreset: text('avatar_preset'),
  avatarUpdatedAt: timestamp('avatar_updated_at', { withTimezone: true }),
  /** Son görülme: kimliği doğrulanmış her istekte (en çok dakikada bir) güncellenir */
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Parola sıfırlama bağlantıları: tek kullanımlık, kısa ömürlü; yalnızca SHA-256 özeti saklanır */
export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    ip: text('ip'),
    createdAt: createdAt(),
  },
  (t) => [index('password_reset_tokens_user_idx').on(t.userId, t.createdAt)],
);

export const verificationStatus = pgEnum('verification_status', [
  'draft',
  'pending',
  'approved',
  'rejected',
]);

export const agentProfiles = pgTable(
  'agent_profiles',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    verificationStatus: verificationStatus('verification_status')
      .notNull()
      .default('draft'),
    /** Taşınmaz Ticareti Yetki Belgesi numarası */
    licenseNumber: text('license_number'),
    /** Belgenin kayıtlı olduğu işletme unvanı (ofis hesabı E2'de ayrıca bağlanır) */
    businessName: text('business_name'),
    city: text('city'),
    district: text('district'),
    bio: text('bio'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewedBy: uuid('reviewed_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    rejectionReason: text('rejection_reason'),
    /** Rozet puanı ve rozet anahtarı (ayarlardaki ölçütlerle periyodik hesaplanır) */
    score: integer('score').notNull().default(0),
    badge: text('badge'),
    scoredAt: timestamp('scored_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('agent_profiles_status_idx').on(t.verificationStatus)],
);

export const verificationDocuments = pgTable(
  'verification_documents',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** document_types.key (yöneticinin tanımladığı evrak türü) */
    type: text('type').notNull(),
    storageKey: text('storage_key').notNull(),
    originalName: text('original_name').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('verification_documents_user_idx').on(t.userId)],
);

export const otpPurpose = pgEnum('otp_purpose', ['login']);

export const otpCodes = pgTable(
  'otp_codes',
  {
    id: id(),
    phone: text('phone').notNull(),
    purpose: otpPurpose('purpose').notNull().default('login'),
    codeHash: text('code_hash').notNull(),
    attempts: integer('attempts').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('otp_codes_phone_created_idx').on(t.phone, t.createdAt)],
);

export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Yenileme belirtecinin SHA-256 özeti; belirtecin kendisi saklanmaz. */
    refreshTokenHash: text('refresh_token_hash').notNull(),
    userAgent: text('user_agent'),
    ip: text('ip'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: createdAt(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('sessions_refresh_hash_idx').on(t.refreshTokenHash),
    index('sessions_user_idx').on(t.userId),
  ],
);

/**
 * kvkk_clarification : KVKK aydınlatma metninin okunduğu
 * terms_of_use       : kullanım koşullarının kabulü
 * marketing          : ticari elektronik ileti izni (isteğe bağlı)
 */
export const consentType = pgEnum('consent_type', [
  'kvkk_clarification',
  'terms_of_use',
  'marketing',
]);

/** Rıza kayıtları yalnızca eklenir, güncellenmez: her değişiklik yeni satırdır. */
export const consents = pgTable(
  'consents',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: consentType('type').notNull(),
    version: text('version').notNull(),
    granted: boolean('granted').notNull(),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
  },
  (t) => [index('consents_user_type_idx').on(t.userId, t.type)],
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: id(),
    actorId: uuid('actor_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
  },
  (t) => [
    index('audit_logs_target_idx').on(t.targetType, t.targetId),
    index('audit_logs_created_idx').on(t.createdAt),
    index('audit_logs_actor_idx').on(t.actorId, t.createdAt),
  ],
);

/** Yönetici ayarları: genel, rozet ölçütleri, entegrasyonlar (gizli alanlar şifreli) */
export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').$type<Record<string, unknown>>().notNull(),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: updatedAt(),
});

/** Danışman onayı için istenen evrak türleri (yönetici belirler) */
export const documentTypes = pgTable('document_types', {
  id: id(),
  key: text('key').notNull().unique(),
  label: text('label').notNull(),
  description: text('description'),
  required: boolean('required').notNull().default(false),
  active: boolean('active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// E2 · Ofis hesabı
// ---------------------------------------------------------------------------

/** pending: yönetici incelemesinde · active: yayında · rejected · suspended */
export const officeStatus = pgEnum('office_status', [
  'pending',
  'active',
  'rejected',
  'suspended',
]);

export const offices = pgTable(
  'offices',
  {
    id: id(),
    /** Platformda görünen ad (örn. "Yılmaz Gayrimenkul Kadıköy") */
    name: text('name').notNull(),
    /** Yetki belgesindeki ticari unvan */
    legalName: text('legal_name').notNull(),
    /** Taşınmaz Ticareti Yetki Belgesi no */
    licenseNumber: text('license_number').notNull(),
    city: text('city').notNull(),
    district: text('district').notNull(),
    address: text('address'),
    phone: text('phone'),
    email: text('email'),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    status: officeStatus('status').notNull().default('pending'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewedBy: uuid('reviewed_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    rejectionReason: text('rejection_reason'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('offices_status_idx').on(t.status),
    // Bir danışman en fazla bir ofisin sahibi olabilir (reddedilenler hariç).
    uniqueIndex('offices_owner_open_idx')
      .on(t.ownerId)
      .where(sql`status <> 'rejected'`),
  ],
);

export const officeRole = pgEnum('office_role', ['owner', 'manager', 'agent']);

/**
 * requested : danışman katılma talebi gönderdi, ofis onayı bekleniyor
 * invited   : ofis davet etti, danışmanın kabulü bekleniyor
 * active    : ofis üyesi
 * declined  : talep/davet reddedildi
 * cancelled : talep/davet gönderen tarafından geri çekildi
 * left      : danışman ayrıldı (veya başka ofise geçti)
 * removed   : ofis tarafından çıkarıldı
 */
export const membershipStatus = pgEnum('membership_status', [
  'requested',
  'invited',
  'active',
  'declined',
  'cancelled',
  'left',
  'removed',
]);

export const officeMemberships = pgTable(
  'office_memberships',
  {
    id: id(),
    officeId: uuid('office_id')
      .notNull()
      .references(() => offices.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: officeRole('role').notNull().default('agent'),
    status: membershipStatus('status').notNull(),
    /** Daveti gönderen ofis yöneticisi */
    invitedBy: uuid('invited_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    /** Talebi/daveti sonuçlandıran kişi */
    decidedBy: uuid('decided_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('office_memberships_office_status_idx').on(t.officeId, t.status),
    index('office_memberships_user_status_idx').on(t.userId, t.status),
    // Bir danışman aynı anda yalnızca bir ofiste aktif olabilir.
    uniqueIndex('office_memberships_one_active_idx')
      .on(t.userId)
      .where(sql`status = 'active'`),
    // Aynı ofise aynı anda tek açık talep/davet.
    uniqueIndex('office_memberships_one_open_idx')
      .on(t.officeId, t.userId)
      .where(sql`status in ('requested', 'invited', 'active')`),
  ],
);

// ---------------------------------------------------------------------------
// Uygulama içi bildirimler (E7'de push bildirimleriyle genişletilecek)
// ---------------------------------------------------------------------------

export const notifications = pgTable(
  'notifications',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    /** İstemcinin yönlendirme için kullanacağı veriler (officeId vb.) */
    data: jsonb('data').$type<Record<string, unknown>>(),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('notifications_user_created_idx').on(t.userId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// E3 · Konum verisi (PTT posta kodu listesi; `pnpm db:seed-locations`)
// ---------------------------------------------------------------------------

export const cities = pgTable('cities', {
  /** Plaka kodu: "34" */
  code: text('code').primaryKey(),
  name: text('name').notNull(),
});

export const districts = pgTable(
  'districts',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    cityCode: text('city_code')
      .notNull()
      .references(() => cities.code, { onDelete: 'cascade' }),
    name: text('name').notNull(),
  },
  (t) => [uniqueIndex('districts_city_name_idx').on(t.cityCode, t.name)],
);

export const neighbourhoods = pgTable(
  'neighbourhoods',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    districtId: integer('district_id')
      .notNull()
      .references(() => districts.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
  },
  (t) => [uniqueIndex('neighbourhoods_district_name_idx').on(t.districtId, t.name)],
);

// ---------------------------------------------------------------------------
// E3 · Portföy
// ---------------------------------------------------------------------------

export const dealType = pgEnum('deal_type', ['sale', 'rent']);

export const listingCategory = pgEnum('listing_category', [
  'apartment',
  'residence',
  'villa',
  'detached_house',
  'land',
  'shop',
  'office',
  'warehouse',
  'building',
  'other',
]);

/** public: herkes · network: takipçiler ve ofis · agents: yalnızca danışmanlar */
export const listingVisibility = pgEnum('listing_visibility', ['public', 'network', 'agents']);

/** removed: yönetici tarafından yayından kaldırıldı */
export const listingStatus = pgEnum('listing_status', [
  'draft',
  'active',
  'passive',
  'sold',
  'removed',
]);

export const eidsStatus = pgEnum('eids_status', ['unverified', 'pending', 'verified', 'failed']);

export const listings = pgTable(
  'listings',
  {
    id: id(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** İlan girildiği andaki ofis (ofis değişse de ilan geçmişi korunur) */
    officeId: uuid('office_id').references(() => offices.id, { onDelete: 'set null' }),
    dealType: dealType('deal_type').notNull(),
    category: listingCategory('category').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    /** Türk lirası, tam sayı */
    price: bigint('price', { mode: 'number' }).notNull(),
    grossM2: integer('gross_m2'),
    netM2: integer('net_m2'),
    /** "3+1", "Stüdyo" gibi */
    rooms: text('rooms'),
    floor: text('floor'),
    buildingAge: integer('building_age'),
    cityCode: text('city_code')
      .notNull()
      .references(() => cities.code),
    districtId: integer('district_id')
      .notNull()
      .references(() => districts.id),
    neighbourhoodId: integer('neighbourhood_id').references(() => neighbourhoods.id),
    /** Alıcı/kiracı tarafındaki danışmana düşen komisyon payı (%). 50 → %50-%50 */
    cobrokeShare: integer('cobroke_share').notNull(),
    visibility: listingVisibility('visibility').notNull().default('public'),
    status: listingStatus('status').notNull().default('draft'),
    /** Lansman öncesi test portföyü; açıkça etiketlenir */
    isDemo: boolean('is_demo').notNull().default(false),
    /** EİDS taşınmaz numarası */
    propertyNumber: text('property_number'),
    eidsStatus: eidsStatus('eids_status').notNull().default('unverified'),
    eidsReference: text('eids_reference'),
    eidsMessage: text('eids_message'),
    eidsCheckedAt: timestamp('eids_checked_at', { withTimezone: true }),
    /** Arama için küçük harfli, aksansız metin (başlık, konum, kategori) */
    searchText: text('search_text').notNull().default(''),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    removedReason: text('removed_reason'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('listings_owner_status_idx').on(t.ownerId, t.status),
    index('listings_feed_idx').on(t.status, t.publishedAt),
    index('listings_location_idx').on(t.cityCode, t.districtId),
  ],
);

export const listingPhotos = pgTable(
  'listing_photos',
  {
    id: id(),
    listingId: uuid('listing_id')
      .notNull()
      .references(() => listings.id, { onDelete: 'cascade' }),
    storageKey: text('storage_key').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    /** 0 = kapak */
    position: integer('position').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('listing_photos_listing_idx').on(t.listingId, t.position)],
);

export const listingLikes = pgTable(
  'listing_likes',
  {
    listingId: uuid('listing_id')
      .notNull()
      .references(() => listings.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('listing_likes_pair_idx').on(t.listingId, t.userId)],
);

export const listingSaves = pgTable(
  'listing_saves',
  {
    listingId: uuid('listing_id')
      .notNull()
      .references(() => listings.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('listing_saves_pair_idx').on(t.listingId, t.userId),
    index('listing_saves_user_idx').on(t.userId, t.createdAt),
  ],
);

/** Danışman takibi ("Benim Ağım") */
export const follows = pgTable(
  'follows',
  {
    followerId: uuid('follower_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    followeeId: uuid('followee_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('follows_pair_idx').on(t.followerId, t.followeeId),
    index('follows_followee_idx').on(t.followeeId),
  ],
);

// ---- E5 · Keşfet ve eşleşme ----

export const swipeDecision = pgEnum('swipe_decision', ['like', 'pass']);

/** Keşfet kartında verilen karar; aynı ilan bir daha gösterilmez (geri alınana kadar). */
export const listingSwipes = pgTable(
  'listing_swipes',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    listingId: uuid('listing_id')
      .notNull()
      .references(() => listings.id, { onDelete: 'cascade' }),
    decision: swipeDecision('decision').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('listing_swipes_pair_idx').on(t.userId, t.listingId),
    index('listing_swipes_user_time_idx').on(t.userId, t.createdAt),
  ],
);

export const interestStatus = pgEnum('interest_status', ['pending', 'accepted', 'declined', 'withdrawn']);

/**
 * "İlgileniyorum" (el sıkışma): bir kullanıcının ilana ilgisi. İlan sahibi
 * kabul ederse eşleşme olur ve mesajlaşma (E7) açılır.
 */
export const interests = pgTable(
  'interests',
  {
    id: id(),
    listingId: uuid('listing_id')
      .notNull()
      .references(() => listings.id, { onDelete: 'cascade' }),
    requesterId: uuid('requester_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: interestStatus('status').notNull().default('pending'),
    note: text('note'),
    /** Keşfet kaydırmasından mı geldi (geri almada birlikte geri çekilir) */
    swipeId: uuid('swipe_id').references(() => listingSwipes.id, { onDelete: 'set null' }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // İlan + kişi başına tek açık/kabul edilmiş ilgi
    uniqueIndex('interests_open_idx')
      .on(t.listingId, t.requesterId)
      .where(sql`status in ('pending', 'accepted')`),
    index('interests_owner_idx').on(t.ownerId, t.status),
    index('interests_requester_idx').on(t.requesterId, t.status),
  ],
);

// ---- E7 · Mesajlaşma ve cihazlar ----

/**
 * İki kişi arasında tek konuşma (WhatsApp gibi); ilan bağlamı mesaj düzeyinde taşınır.
 * pair_key = küçük kimlik + ':' + büyük kimlik.
 */
export const conversations = pgTable('conversations', {
  id: id(),
  pairKey: text('pair_key').notNull().unique(),
  lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
  createdAt: createdAt(),
});

export const conversationParticipants = pgTable(
  'conversation_participants',
  {
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lastReadAt: timestamp('last_read_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('conversation_participants_pk').on(t.conversationId, t.userId),
    index('conversation_participants_user_idx').on(t.userId),
  ],
);

export const messageKind = pgEnum('message_kind', ['text', 'listing', 'system']);

export const messages = pgTable(
  'messages',
  {
    id: id(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    /** Sistem mesajında null */
    senderId: uuid('sender_id').references(() => users.id, { onDelete: 'set null' }),
    kind: messageKind('kind').notNull().default('text'),
    body: text('body').notNull(),
    /** Paylaşılan ilan (ilan kartı olarak gösterilir) */
    listingId: uuid('listing_id').references(() => listings.id, { onDelete: 'set null' }),
    /** Ekleme sırası: sayfalama ve yoklama imleci (aynı işlemdeki mesajlar da sıralı) */
    seq: bigserial('seq', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (t) => [index('messages_conversation_seq_idx').on(t.conversationId, t.seq)],
);

export const devicePlatform = pgEnum('device_platform', ['android', 'ios', 'web']);

/** Push bildirimi için cihaz belirteçleri (FCM/APNs) */
export const devices = pgTable(
  'devices',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    platform: devicePlatform('platform').notNull(),
    createdAt: createdAt(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('devices_user_idx').on(t.userId)],
);

// ---- E8 · Ödeme ----

/**
 * Danışmanın ödeme alacağı hesap (pazaryeri alt üye işyeri). Ödeme sağlayıcısında
 * alt üye kaydı açıldığında `providerRef` dolar ve durum `verified` olur.
 */
export const payoutAccountStatus = pgEnum('payout_account_status', ['pending', 'verified', 'rejected']);

export const payoutAccounts = pgTable('payout_accounts', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  holderName: text('holder_name').notNull(),
  /** TR IBAN, boşluksuz büyük harf */
  iban: text('iban').notNull(),
  /** TCKN (11) veya VKN (10) */
  taxId: text('tax_id').notNull(),
  status: payoutAccountStatus('status').notNull().default('pending'),
  providerRef: text('provider_ref'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const paymentStatus = pgEnum('payment_status', ['open', 'paid', 'cancelled', 'expired', 'refunded']);

/** Komisyon ödeme talebi: danışman oluşturur, ödeyen herkese açık bağlantıdan kartla öder. */
export const paymentRequests = pgTable(
  'payment_requests',
  {
    id: id(),
    /** Herkese açık ödeme bağlantısındaki tahmin edilemez belirteç */
    publicToken: text('public_token').notNull().unique(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    listingId: uuid('listing_id').references(() => listings.id, { onDelete: 'set null' }),
    /** Alıcı tarafındaki danışman (paylaşımlı işlem) */
    buyerAgentId: uuid('buyer_agent_id').references(() => users.id),
    /** Alıcı danışmanın payı (%) — komisyonun platform payı düşüldükten sonraki kısmından */
    buyerShare: integer('buyer_share').notNull().default(0),
    payerName: text('payer_name').notNull(),
    payerPhone: text('payer_phone'),
    payerEmail: text('payer_email'),
    description: text('description').notNull(),
    /** Kuruş cinsinden */
    amount: bigint('amount', { mode: 'number' }).notNull(),
    currency: text('currency').notNull().default('TRY'),
    /** Platform hizmet bedeli, binde değil on binde (500 = %5) */
    platformFeeBps: integer('platform_fee_bps').notNull(),
    status: paymentStatus('status').notNull().default('open'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    provider: text('provider').notNull(),
    providerSessionId: text('provider_session_id'),
    providerPaymentId: text('provider_payment_id'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('payment_requests_creator_idx').on(t.createdBy, t.createdAt),
    index('payment_requests_buyer_agent_idx').on(t.buyerAgentId),
  ],
);

export const splitKind = pgEnum('split_kind', ['platform', 'seller_agent', 'buyer_agent']);
export const payoutStatus = pgEnum('payout_status', ['pending', 'settled', 'held', 'failed']);

/** Ödemenin paylaşımı: platform, ilan danışmanı, alıcı danışmanı */
export const paymentSplits = pgTable(
  'payment_splits',
  {
    id: id(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => paymentRequests.id, { onDelete: 'cascade' }),
    kind: splitKind('kind').notNull(),
    /** Platform payında null */
    userId: uuid('user_id').references(() => users.id),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    payoutStatus: payoutStatus('payout_status').notNull().default('pending'),
    payoutRef: text('payout_ref'),
    settledAt: timestamp('settled_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('payment_splits_kind_idx').on(t.requestId, t.kind),
    index('payment_splits_user_idx').on(t.userId),
  ],
);

/** Sağlayıcı bildirimleri (webhook) — tekrar gelen olay bir kez işlenir */
export const paymentEvents = pgTable(
  'payment_events',
  {
    id: id(),
    provider: text('provider').notNull(),
    eventId: text('event_id').notNull(),
    type: text('type').notNull(),
    payload: jsonb('payload').notNull(),
    requestId: uuid('request_id').references(() => paymentRequests.id, { onDelete: 'set null' }),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('payment_events_provider_event_idx').on(t.provider, t.eventId)],
);

export const invoiceStatus = pgEnum('invoice_status', ['pending', 'issued', 'failed']);

/**
 * Platform hizmet bedeli faturası kaydı. e-Fatura/e-Arşiv entegrasyonu (kim keser
 * kararı netleşince) bu kayıtları `issued` yapacak.
 */
export const invoices = pgTable(
  'invoices',
  {
    id: id(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => paymentRequests.id),
    /** Faturanın kesildiği taraf (ilan danışmanı) */
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    /** Kuruş: KDV hariç, KDV, toplam */
    net: bigint('net', { mode: 'number' }).notNull(),
    vat: bigint('vat', { mode: 'number' }).notNull(),
    total: bigint('total', { mode: 'number' }).notNull(),
    vatRateBps: integer('vat_rate_bps').notNull(),
    status: invoiceStatus('status').notNull().default('pending'),
    number: text('number'),
    issuedAt: timestamp('issued_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('invoices_request_idx').on(t.requestId)],
);

// ---- E9 · Yönetim ----

export const reportReason = pgEnum('report_reason', [
  'misleading',
  'wrong_price',
  'not_available',
  'duplicate',
  'fraud',
  'other',
]);
export const reportStatus = pgEnum('report_status', ['open', 'resolved', 'dismissed']);

/** İlan şikâyeti; kullanıcı + ilan başına tek açık şikâyet */
export const listingReports = pgTable(
  'listing_reports',
  {
    id: id(),
    listingId: uuid('listing_id')
      .notNull()
      .references(() => listings.id, { onDelete: 'cascade' }),
    reporterId: uuid('reporter_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reason: reportReason('reason').notNull(),
    note: text('note'),
    status: reportStatus('status').notNull().default('open'),
    resolvedBy: uuid('resolved_by').references(() => users.id, { onDelete: 'set null' }),
    resolution: text('resolution'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('listing_reports_open_idx')
      .on(t.listingId, t.reporterId)
      .where(sql`status = 'open'`),
    index('listing_reports_status_idx').on(t.status, t.createdAt),
  ],
);

export type User = typeof users.$inferSelect;
export type AgentProfile = typeof agentProfiles.$inferSelect;
export type VerificationDocument = typeof verificationDocuments.$inferSelect;
export type UserRole = (typeof userRole.enumValues)[number];
export type VerificationStatus = (typeof verificationStatus.enumValues)[number];
/** document_types.key */
export type DocumentType = string;
export type ConsentType = (typeof consentType.enumValues)[number];
export type Office = typeof offices.$inferSelect;
export type OfficeStatus = (typeof officeStatus.enumValues)[number];
export type OfficeRole = (typeof officeRole.enumValues)[number];
export type OfficeMembership = typeof officeMemberships.$inferSelect;
export type MembershipStatus = (typeof membershipStatus.enumValues)[number];
export type Listing = typeof listings.$inferSelect;
export type DealType = (typeof dealType.enumValues)[number];
export type ListingCategory = (typeof listingCategory.enumValues)[number];
export type ListingVisibility = (typeof listingVisibility.enumValues)[number];
export type ListingStatus = (typeof listingStatus.enumValues)[number];
export type EidsStatus = (typeof eidsStatus.enumValues)[number];
export type Interest = typeof interests.$inferSelect;
export type InterestStatus = (typeof interestStatus.enumValues)[number];
export type Message = typeof messages.$inferSelect;
export type DevicePlatform = (typeof devicePlatform.enumValues)[number];
export type PaymentRequest = typeof paymentRequests.$inferSelect;
export type PaymentStatus = (typeof paymentStatus.enumValues)[number];
export type ReportReason = (typeof reportReason.enumValues)[number];
