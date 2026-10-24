import { sql } from 'drizzle-orm';
import {
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
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

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
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('agent_profiles_status_idx').on(t.verificationStatus)],
);

export const documentType = pgEnum('document_type', [
  'authority_certificate',
  'identity',
  'other',
]);

export const verificationDocuments = pgTable(
  'verification_documents',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: documentType('type').notNull(),
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
    createdAt: createdAt(),
  },
  (t) => [index('audit_logs_target_idx').on(t.targetType, t.targetId)],
);

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

export type User = typeof users.$inferSelect;
export type AgentProfile = typeof agentProfiles.$inferSelect;
export type VerificationDocument = typeof verificationDocuments.$inferSelect;
export type UserRole = (typeof userRole.enumValues)[number];
export type VerificationStatus = (typeof verificationStatus.enumValues)[number];
export type DocumentType = (typeof documentType.enumValues)[number];
export type ConsentType = (typeof consentType.enumValues)[number];
export type Office = typeof offices.$inferSelect;
export type OfficeStatus = (typeof officeStatus.enumValues)[number];
export type OfficeRole = (typeof officeRole.enumValues)[number];
export type OfficeMembership = typeof officeMemberships.$inferSelect;
export type MembershipStatus = (typeof membershipStatus.enumValues)[number];
