import { avatarOf } from '../users/avatar.js';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, ilike, isNull, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { AuditService } from '../common/audit.service.js';
import { isUniqueViolation } from '../common/db-errors.js';
import { normalizeTrPhone } from '../common/phone.js';
import { InjectDb, type Database } from '../db/db.module.js';
import {
  agentProfiles,
  cities,
  districts,
  invoices,
  listingReports,
  listings,
  paymentRequests,
  sessions,
  users,
} from '../db/schema.js';
import { ListingsService } from '../listings/listings.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type {
  AdminListingsQuery,
  AdminPaymentsQuery,
  AdminUsersQuery,
  EidsDecisionDto,
  ReportListingDto,
  ReportsQuery,
} from './ops.dto.js';

const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

@Injectable()
export class AdminOpsService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly listings: ListingsService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  // ---- Panel özeti ----

  async dashboard() {
    const { rows } = await this.db.execute<Record<string, string | number>>(sql`
      select
        (select count(*) from users where role = 'agent')::int as agents,
        (select count(*) from users where role = 'consumer')::int as consumers,
        (select count(*) from users where status = 'suspended')::int as suspended,
        (select count(*) from users where created_at > now() - interval '7 days')::int as new_users_7d,
        (select count(*) from agent_profiles where verification_status = 'approved')::int as verified_agents,
        (select count(*) from agent_profiles where verification_status = 'pending')::int as pending_verifications,
        (select count(*) from offices where status = 'pending')::int as pending_offices,
        (select count(*) from offices where status = 'active')::int as active_offices,
        (select count(*) from listings where status = 'active')::int as active_listings,
        (select count(*) from listings where status = 'active' and is_demo)::int as demo_listings,
        (select count(*) from listings where published_at > now() - interval '7 days')::int as new_listings_7d,
        (select count(*) from listings where eids_status = 'pending')::int as pending_eids,
        (select count(*) from listing_reports where status = 'open')::int as open_reports,
        (select count(*) from interests)::int as interests,
        (select count(*) from interests where status = 'accepted')::int as matches,
        (select count(*) from messages where created_at > now() - interval '7 days')::int as messages_7d,
        (select count(*) from payment_requests where status = 'paid')::int as paid_payments,
        (select coalesce(sum(amount), 0) from payment_requests where status = 'paid')::bigint as paid_volume,
        (select coalesce(sum(amount), 0) from payment_splits where kind = 'platform')::bigint as platform_revenue,
        (select coalesce(sum(amount), 0) from payment_splits where payout_status = 'held')::bigint as held_payouts,
        (select count(*) from invoices where status = 'pending')::int as pending_invoices
    `);
    const r = rows[0]!;
    return Object.fromEntries(
      Object.entries(r).map(([k, v]) => [k.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase()), Number(v)]),
    );
  }

  /** Panel grafikleri: haftalık/aylık seriler, dağılımlar, son etkinlik, öne çıkanlar */
  async charts() {
    const rows = async <T>(q: SQL) => (await this.db.execute<T & Record<string, unknown>>(q)).rows as T[];
    const weeks = sql`generate_series(date_trunc('week', now()) - interval '11 weeks', date_trunc('week', now()), interval '1 week')`;

    const [weekly, monthly, categories, deals, topDistricts, funnel, activity, topAgents, latest, prev] = await Promise.all([
      rows<{ week: string; agents: number; consumers: number; listings: number; interests: number; messages: number }>(sql`
        select w::date::text as week,
          (select count(*)::int from users u where u.role = 'agent' and date_trunc('week', u.created_at) = w) as agents,
          (select count(*)::int from users u where u.role = 'consumer' and date_trunc('week', u.created_at) = w) as consumers,
          (select count(*)::int from listings l where date_trunc('week', l.published_at) = w) as listings,
          (select count(*)::int from interests i where date_trunc('week', i.created_at) = w) as interests,
          (select count(*)::int from messages m where m.kind <> 'system' and date_trunc('week', m.created_at) = w) as messages
        from ${weeks} w order by w`),
      rows<{ month: string; volume: number; revenue: number; count: number }>(sql`
        select m::date::text as month,
          coalesce((select sum(p.amount) from payment_requests p where p.status = 'paid' and date_trunc('month', p.paid_at) = m), 0)::bigint as volume,
          coalesce((select sum(s.amount) from payment_splits s join payment_requests p on p.id = s.request_id
                    where s.kind = 'platform' and p.status = 'paid' and date_trunc('month', p.paid_at) = m), 0)::bigint as revenue,
          (select count(*)::int from payment_requests p where p.status = 'paid' and date_trunc('month', p.paid_at) = m) as count
        from generate_series(date_trunc('month', now()) - interval '5 months', date_trunc('month', now()), interval '1 month') m
        order by m`),
      rows<{ category: string; count: number }>(sql`
        select category::text, count(*)::int from listings where status = 'active' group by category order by 2 desc`),
      rows<{ dealType: string; count: number; avgPrice: number }>(sql`
        select deal_type::text as "dealType", count(*)::int, coalesce(avg(price), 0)::bigint as "avgPrice"
        from listings where status = 'active' group by deal_type`),
      rows<{ district: string; count: number; avgSale: number | null }>(sql`
        select d.name as district, count(*)::int,
          avg(l.price) filter (where l.deal_type = 'sale')::bigint as "avgSale"
        from listings l join districts d on d.id = l.district_id
        where l.status = 'active' group by d.name order by 2 desc, 1 limit 6`),
      rows<{ status: string; count: number }>(sql`
        select verification_status::text as status, count(*)::int from agent_profiles group by 1`),
      rows<{ id: string; action: string; targetType: string; targetId: string | null; actor: string | null; at: string }>(sql`
        select a.id, a.action, a.target_type as "targetType", a.target_id as "targetId", u.full_name as actor, a.created_at as at
        from audit_logs a left join users u on u.id = a.actor_id
        order by a.created_at desc limit 10`),
      rows<{ id: string; fullName: string; office: string | null; listings: number; likes: number; matches: number; badge: string | null; score: number }>(sql`
        select u.id, u.full_name as "fullName", ap.badge, ap.score,
          (select o.name from office_memberships m join offices o on o.id = m.office_id
            where m.user_id = u.id and m.status = 'active' limit 1) as office,
          (select count(*)::int from listings l where l.owner_id = u.id and l.status = 'active') as listings,
          (select count(*)::int from listing_likes k join listings l on l.id = k.listing_id where l.owner_id = u.id) as likes,
          (select count(*)::int from interests i where i.owner_id = u.id and i.status = 'accepted') as matches
        from users u join agent_profiles ap on ap.user_id = u.id
        where u.role = 'agent' and u.status = 'active' and ap.verification_status = 'approved'
        order by ap.score desc, listings desc limit 5`),
      rows<{ id: string; title: string; price: number; dealType: string; district: string; owner: string; photoId: string | null; publishedAt: string }>(sql`
        select l.id, l.title, l.price, l.deal_type::text as "dealType", d.name as district, u.full_name as owner,
          (select p.id from listing_photos p where p.listing_id = l.id order by p.position limit 1) as "photoId",
          l.published_at as "publishedAt"
        from listings l join districts d on d.id = l.district_id join users u on u.id = l.owner_id
        where l.status = 'active' order by l.published_at desc nulls last limit 6`),
      rows<{ users: number; listings: number; messages: number; interests: number }>(sql`
        select
          (select count(*)::int from users where created_at between now() - interval '14 days' and now() - interval '7 days') as users,
          (select count(*)::int from listings where published_at between now() - interval '14 days' and now() - interval '7 days') as listings,
          (select count(*)::int from messages where created_at between now() - interval '14 days' and now() - interval '7 days') as messages,
          (select count(*)::int from interests where created_at between now() - interval '14 days' and now() - interval '7 days') as interests`),
    ]);
    const num = <T extends Record<string, unknown>>(list: T[], keys: (keyof T)[]) =>
      list.map((r) => ({ ...r, ...Object.fromEntries(keys.map((k) => [k, r[k] == null ? null : Number(r[k])])) }));
    return {
      weekly,
      monthly: num(monthly, ['volume', 'revenue']),
      categories,
      deals: num(deals, ['avgPrice']),
      topDistricts: num(topDistricts, ['avgSale']),
      funnel,
      activity,
      topAgents,
      latest: num(latest, ['price']),
      previousWeek: prev[0],
    };
  }

  // ---- Kullanıcılar ----

  async users(q: AdminUsersQuery) {
    const conds: SQL[] = [];
    if (q.role) conds.push(eq(users.role, q.role));
    if (q.status) conds.push(eq(users.status, q.status));
    if (q.q?.trim()) {
      const text = q.q.trim();
      const phone = normalizeTrPhone(text);
      conds.push(
        or(
          ilike(users.fullName, `%${likeEscape(text)}%`),
          ...(phone ? [eq(users.phone, phone)] : []),
          ilike(users.phone, `%${likeEscape(text.replace(/\D/g, '').slice(-10)) || '__none__'}%`),
        )!,
      );
    }
    const where = conds.length ? and(...conds) : undefined;
    const [items, [{ total }]] = await Promise.all([
      this.db
        .select({
          id: users.id,
          fullName: users.fullName,
          phone: users.phone,
          role: users.role,
          status: users.status,
          verification: agentProfiles.verificationStatus,
          badge: agentProfiles.badge,
          score: agentProfiles.score,
          createdAt: users.createdAt,
          lastLoginAt: users.lastLoginAt,
          lastSeenAt: users.lastSeenAt,
          online: sql<boolean>`coalesce(${users.lastSeenAt} > now() - interval '5 minutes', false)`,
          avatarKey: users.avatarKey,
          avatarPreset: users.avatarPreset,
          avatarUpdatedAt: users.avatarUpdatedAt,
          activeListings: sql<number>`(select count(*)::int from listings l where l.owner_id = "users"."id" and l.status = 'active')`,
          officeName: sql<string | null>`(
            select o.name from office_memberships m join offices o on o.id = m.office_id
            where m.user_id = "users"."id" and m.status = 'active' limit 1
          )`,
        })
        .from(users)
        .leftJoin(agentProfiles, eq(agentProfiles.userId, users.id))
        .where(where)
        .orderBy(desc(users.createdAt))
        .limit(q.limit ?? 30)
        .offset(q.offset ?? 0),
      this.db.select({ total: sql<number>`count(*)::int` }).from(users).where(where),
    ]);
    return {
      items: items.map(({ avatarKey, avatarPreset, avatarUpdatedAt, ...u }) => ({ ...u, avatar: avatarOf({ id: u.id, avatarKey, avatarPreset, avatarUpdatedAt }) })),
      total,
    };
  }

  async user(id: string) {
    const [u] = await this.db
      .select({
        id: users.id,
        fullName: users.fullName,
        phone: users.phone,
        email: users.email,
        role: users.role,
        status: users.status,
        suspendedReason: users.suspendedReason,
        suspendedAt: users.suspendedAt,
        createdAt: users.createdAt,
        lastLoginAt: users.lastLoginAt,
        verification: agentProfiles.verificationStatus,
        licenseNumber: agentProfiles.licenseNumber,
        businessName: agentProfiles.businessName,
      })
      .from(users)
      .leftJoin(agentProfiles, eq(agentProfiles.userId, users.id))
      .where(eq(users.id, id));
    if (!u) throw new NotFoundException('Kullanıcı bulunamadı');
    const { rows } = await this.db.execute<Record<string, number>>(sql`
      select
        (select count(*) from listings where owner_id = ${id} and status = 'active')::int as active_listings,
        (select count(*) from listings where owner_id = ${id})::int as all_listings,
        (select count(*) from follows where followee_id = ${id})::int as followers,
        (select count(*) from listing_reports r join listings l on l.id = r.listing_id where l.owner_id = ${id})::int as reports_against,
        (select count(*) from payment_requests where created_by = ${id} and status = 'paid')::int as paid_payments,
        (select count(*) from sessions where user_id = ${id} and revoked_at is null and expires_at > now())::int as active_sessions
    `);
    const c = rows[0]!;
    return {
      ...u,
      stats: {
        activeListings: c.active_listings,
        allListings: c.all_listings,
        followers: c.followers,
        reportsAgainst: c.reports_against,
        paidPayments: c.paid_payments,
        activeSessions: c.active_sessions,
      },
    };
  }

  /** Askıya alır: oturumlar kapanır, ilanları akış/aramadan düşer (sahibinin durumu kontrol edilir) */
  async suspend(adminId: string, id: string, reason: string) {
    if (id === adminId) throw new BadRequestException({ code: 'SELF', message: 'Kendi hesabınızı askıya alamazsınız' });
    const [u] = await this.db.select({ role: users.role, status: users.status }).from(users).where(eq(users.id, id));
    if (!u) throw new NotFoundException('Kullanıcı bulunamadı');
    if (u.role === 'admin') throw new BadRequestException({ code: 'ADMIN', message: 'Yönetici hesabı askıya alınamaz' });
    if (u.status === 'suspended') throw new ConflictException({ code: 'ALREADY', message: 'Hesap zaten askıda' });
    await this.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ status: 'suspended', suspendedReason: reason.trim(), suspendedAt: new Date() })
        .where(eq(users.id, id));
      await tx
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(sessions.userId, id), isNull(sessions.revokedAt)));
      await this.audit.log({ actorId: adminId, action: 'user.suspended', targetType: 'user', targetId: id, metadata: { reason } }, tx);
    });
    return this.user(id);
  }

  async reactivate(adminId: string, id: string) {
    const [u] = await this.db.select({ status: users.status }).from(users).where(eq(users.id, id));
    if (!u) throw new NotFoundException('Kullanıcı bulunamadı');
    if (u.status !== 'suspended') throw new ConflictException({ code: 'NOT_SUSPENDED', message: 'Hesap askıda değil' });
    await this.db.update(users).set({ status: 'active', suspendedReason: null, suspendedAt: null }).where(eq(users.id, id));
    await this.audit.log({ actorId: adminId, action: 'user.reactivated', targetType: 'user', targetId: id });
    await this.notifications.notify({
      userId: id,
      type: 'account.reactivated',
      title: 'Hesabın yeniden etkin',
      body: 'Emlook hesabın yönetici tarafından yeniden etkinleştirildi.',
    });
    return this.user(id);
  }

  // ---- İlan moderasyonu ----

  async listingsList(q: AdminListingsQuery) {
    const conds: SQL[] = [];
    if (q.status) conds.push(eq(listings.status, q.status));
    if (q.eids) conds.push(eq(listings.eidsStatus, q.eids));
    if (q.q?.trim()) {
      const t = `%${likeEscape(q.q.trim())}%`;
      conds.push(or(ilike(listings.title, t), ilike(users.fullName, t), ilike(listings.propertyNumber, t))!);
    }
    const where = conds.length ? and(...conds) : undefined;
    const base = this.db
      .select({
        id: listings.id,
        title: listings.title,
        dealType: listings.dealType,
        price: listings.price,
        status: listings.status,
        isDemo: listings.isDemo,
        visibility: listings.visibility,
        eidsStatus: listings.eidsStatus,
        propertyNumber: listings.propertyNumber,
        removedReason: listings.removedReason,
        publishedAt: listings.publishedAt,
        createdAt: listings.createdAt,
        city: cities.name,
        district: districts.name,
        owner: { id: users.id, fullName: users.fullName, status: users.status },
        openReports: sql<number>`(select count(*)::int from listing_reports r where r.listing_id = "listings"."id" and r.status = 'open')`,
        licenseNumber: agentProfiles.licenseNumber,
      })
      .from(listings)
      .innerJoin(users, eq(users.id, listings.ownerId))
      .leftJoin(agentProfiles, eq(agentProfiles.userId, users.id))
      .innerJoin(cities, eq(cities.code, listings.cityCode))
      .innerJoin(districts, eq(districts.id, listings.districtId));
    const [items, [{ total }]] = await Promise.all([
      base
        .where(where)
        .orderBy(desc(listings.updatedAt))
        .limit(q.limit ?? 30)
        .offset(q.offset ?? 0),
      this.db
        .select({ total: sql<number>`count(*)::int` })
        .from(listings)
        .innerJoin(users, eq(users.id, listings.ownerId))
        .where(where),
    ]);
    return { items, total };
  }

  async removeListing(adminId: string, id: string, reason: string) {
    const [l] = await this.db.select().from(listings).where(eq(listings.id, id));
    if (!l) throw new NotFoundException('İlan bulunamadı');
    if (l.status === 'removed') throw new ConflictException({ code: 'ALREADY', message: 'İlan zaten kaldırılmış' });
    await this.db.transaction(async (tx) => {
      await tx.update(listings).set({ status: 'removed', removedReason: reason.trim() }).where(eq(listings.id, id));
      await tx
        .update(listingReports)
        .set({ status: 'resolved', resolvedBy: adminId, resolvedAt: new Date(), resolution: `İlan kaldırıldı: ${reason.trim()}` })
        .where(and(eq(listingReports.listingId, id), eq(listingReports.status, 'open')));
      await this.audit.log(
        { actorId: adminId, action: 'listing.removed', targetType: 'listing', targetId: id, metadata: { reason } },
        tx,
      );
      await this.notifications.notify(
        {
          userId: l.ownerId,
          type: 'listing.removed',
          title: 'İlanın yayından kaldırıldı',
          body: `"${l.title}" yönetici tarafından kaldırıldı: ${reason.trim()}`,
          data: { listingId: id },
        },
        tx,
      );
    });
    return this.listings.detail(id, { id: adminId, role: 'admin' });
  }

  /** Kaldırılan ilanı sahibine geri verir (pasif; sahibi tekrar yayına alabilir) */
  async restoreListing(adminId: string, id: string) {
    const [l] = await this.db.select().from(listings).where(eq(listings.id, id));
    if (!l) throw new NotFoundException('İlan bulunamadı');
    if (l.status !== 'removed') throw new ConflictException({ code: 'NOT_REMOVED', message: 'İlan kaldırılmış değil' });
    await this.db.update(listings).set({ status: 'passive', removedReason: null }).where(eq(listings.id, id));
    await this.audit.log({ actorId: adminId, action: 'listing.restored', targetType: 'listing', targetId: id });
    await this.notifications.notify({
      userId: l.ownerId,
      type: 'listing.restored',
      title: 'İlanın geri yüklendi',
      body: `"${l.title}" pasif olarak geri yüklendi; yeniden yayına alabilirsin.`,
      data: { listingId: id },
    });
    return this.listings.detail(id, { id: adminId, role: 'admin' });
  }

  /** EİDS elle doğrulama (manual sağlayıcı) */
  async decideEids(adminId: string, id: string, dto: EidsDecisionDto) {
    const [l] = await this.db.select().from(listings).where(eq(listings.id, id));
    if (!l) throw new NotFoundException('İlan bulunamadı');
    if (!l.propertyNumber) throw new BadRequestException({ code: 'NO_PROPERTY_NUMBER', message: 'İlanda taşınmaz numarası yok' });
    if (l.eidsStatus === 'verified') throw new ConflictException({ code: 'ALREADY', message: 'EİDS zaten doğrulanmış' });
    const ok = dto.decision === 'verified';
    await this.db
      .update(listings)
      .set({
        eidsStatus: dto.decision,
        eidsMessage: dto.message?.trim() || (ok ? 'Yetki yönetici tarafından doğrulandı' : 'Yetki doğrulanamadı'),
        eidsReference: ok ? `MANUAL-${new Date().toISOString().slice(0, 10)}` : null,
        eidsCheckedAt: new Date(),
      })
      .where(eq(listings.id, id));
    await this.audit.log({
      actorId: adminId,
      action: ok ? 'listing.eids_verified' : 'listing.eids_failed',
      targetType: 'listing',
      targetId: id,
      metadata: { message: dto.message ?? null },
    });
    await this.notifications.notify({
      userId: l.ownerId,
      type: ok ? 'listing.eids_verified' : 'listing.eids_failed',
      title: ok ? 'EİDS doğrulandı' : 'EİDS doğrulanamadı',
      body: ok ? `"${l.title}" yayına alınabilir.` : `"${l.title}": ${dto.message?.trim() || 'taşınmaz numarasını kontrol edin'}`,
      data: { listingId: id },
    });
    return this.listings.detail(id, { id: adminId, role: 'admin' });
  }

  // ---- Şikâyetler ----

  async report(viewer: { id: string; role: 'agent' | 'consumer' | 'admin' | null }, listingId: string, dto: ReportListingDto) {
    const l = await this.listings.assertCanView(viewer, listingId);
    if (l.ownerId === viewer.id) throw new BadRequestException({ code: 'OWN_LISTING', message: 'Kendi ilanını şikâyet edemezsin' });
    try {
      const [row] = await this.db
        .insert(listingReports)
        .values({ listingId, reporterId: viewer.id, reason: dto.reason, note: dto.note?.trim() || null })
        .returning({ id: listingReports.id, status: listingReports.status });
      return row;
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new ConflictException({ code: 'ALREADY_REPORTED', message: 'Bu ilanı zaten bildirdin; inceleniyor' });
      }
      throw e;
    }
  }

  async reports(q: ReportsQuery) {
    const reporter = alias(users, 'reporter');
    const owner = alias(users, 'owner');
    const status = q.status ?? 'open';
    const where = status === 'all' ? undefined : eq(listingReports.status, status);
    const items = await this.db
      .select({
        id: listingReports.id,
        reason: listingReports.reason,
        note: listingReports.note,
        status: listingReports.status,
        resolution: listingReports.resolution,
        createdAt: listingReports.createdAt,
        resolvedAt: listingReports.resolvedAt,
        listing: { id: listings.id, title: listings.title, status: listings.status },
        owner: { id: owner.id, fullName: owner.fullName },
        reporter: { id: reporter.id, fullName: reporter.fullName, role: reporter.role },
        sameListingOpen: sql<number>`(select count(*)::int from listing_reports r2 where r2.listing_id = "listing_reports"."listing_id" and r2.status = 'open')`,
      })
      .from(listingReports)
      .innerJoin(listings, eq(listings.id, listingReports.listingId))
      .innerJoin(owner, eq(owner.id, listings.ownerId))
      .innerJoin(reporter, eq(reporter.id, listingReports.reporterId))
      .where(where)
      .orderBy(desc(listingReports.createdAt))
      .limit(q.limit ?? 30)
      .offset(q.offset ?? 0);
    const [{ total }] = await this.db.select({ total: sql<number>`count(*)::int` }).from(listingReports).where(where);
    return { items, total };
  }

  async dismissReport(adminId: string, id: string, note?: string) {
    const [r] = await this.db.select().from(listingReports).where(eq(listingReports.id, id));
    if (!r) throw new NotFoundException('Şikâyet bulunamadı');
    if (r.status !== 'open') throw new ConflictException({ code: 'CLOSED', message: 'Şikâyet zaten kapatılmış' });
    await this.db
      .update(listingReports)
      .set({ status: 'dismissed', resolvedBy: adminId, resolvedAt: new Date(), resolution: note?.trim() || 'Sorun bulunmadı' })
      .where(eq(listingReports.id, id));
    await this.audit.log({ actorId: adminId, action: 'report.dismissed', targetType: 'listing_report', targetId: id });
    return { id, status: 'dismissed' as const };
  }

  // ---- Ödemeler ----

  async payments(q: AdminPaymentsQuery) {
    const seller = alias(users, 'seller');
    const buyer = alias(users, 'buyer');
    const where = q.status ? eq(paymentRequests.status, q.status) : undefined;
    const items = await this.db
      .select({
        id: paymentRequests.id,
        status: paymentRequests.status,
        amount: paymentRequests.amount,
        description: paymentRequests.description,
        payerName: paymentRequests.payerName,
        platformFee: sql<number>`round(${paymentRequests.amount} * ${paymentRequests.platformFeeBps} / 10000.0)::bigint`,
        buyerShare: paymentRequests.buyerShare,
        provider: paymentRequests.provider,
        providerPaymentId: paymentRequests.providerPaymentId,
        createdAt: paymentRequests.createdAt,
        paidAt: paymentRequests.paidAt,
        seller: { id: seller.id, fullName: seller.fullName },
        buyerAgent: { id: buyer.id, fullName: buyer.fullName },
        invoiceStatus: invoices.status,
      })
      .from(paymentRequests)
      .innerJoin(seller, eq(seller.id, paymentRequests.createdBy))
      .leftJoin(buyer, eq(buyer.id, paymentRequests.buyerAgentId))
      .leftJoin(invoices, eq(invoices.requestId, paymentRequests.id))
      .where(where)
      .orderBy(desc(paymentRequests.createdAt))
      .limit(q.limit ?? 30)
      .offset(q.offset ?? 0);
    const [{ total }] = await this.db.select({ total: sql<number>`count(*)::int` }).from(paymentRequests).where(where);
    return {
      items: items.map((i) => ({
        ...i,
        platformFee: Number(i.platformFee),
        buyerAgent: i.buyerAgent?.id ? i.buyerAgent : null,
      })),
      total,
    };
  }
}
