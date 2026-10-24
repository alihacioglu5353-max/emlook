import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, count, desc, eq, ilike, inArray, ne, or, sql } from 'drizzle-orm';
import { AuditService } from '../common/audit.service.js';
import { normalizeTrPhone } from '../common/phone.js';
import { InjectDb, type Database } from '../db/db.module.js';
import {
  agentProfiles,
  officeMemberships,
  offices,
  users,
  type Office,
  type OfficeMembership,
  type OfficeRole,
  type OfficeStatus,
} from '../db/schema.js';
import {
  NotificationsService,
  type NewNotification,
} from '../notifications/notifications.service.js';
import type { CreateOfficeDto, UpdateOfficeDto } from './dto.js';

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
type Conn = Database | Tx;

const OPEN = ['requested', 'invited'] as const;

const conflict = (code: string, message: string) =>
  new ConflictException({ code, message });

/** Postgres benzersizlik ihlali (aynı anda iki istek). Drizzle hatayı `cause` içine sarar. */
function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: string; cause?: { code?: string } } | null;
  return err?.code === '23505' || err?.cause?.code === '23505';
}

@Injectable()
export class OfficesService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // Danışman tarafı
  // -------------------------------------------------------------------------

  /**
   * Onaylı bir danışman ofis açar. Ofis yönetici onayına kadar `pending`
   * kalır; açan kişi "Sahip" rolüyle ofise bağlanır.
   */
  async create(userId: string, dto: CreateOfficeDto) {
    await this.assertApprovedAgent(userId);
    try {
      const officeId = await this.db.transaction(async (tx) => {
        const current = await this.activeMembership(tx, userId, true);
        if (current) {
          throw conflict(
            'ALREADY_IN_OFFICE',
            current.role === 'owner'
              ? 'Zaten bir ofisin sahibisiniz'
              : 'Yeni ofis açmadan önce mevcut ofisinizden ayrılın',
          );
        }
        const [office] = await tx
          .insert(offices)
          .values({
            name: dto.name.trim(),
            legalName: dto.legalName.trim(),
            licenseNumber: dto.licenseNumber.trim(),
            city: dto.city.trim(),
            district: dto.district.trim(),
            address: dto.address?.trim() || null,
            phone: dto.phone?.trim() || null,
            email: dto.email?.toLowerCase() || null,
            ownerId: userId,
          })
          .returning({ id: offices.id });
        await tx.insert(officeMemberships).values({
          officeId: office.id,
          userId,
          role: 'owner',
          status: 'active',
          decidedAt: new Date(),
        });
        // Açık talep ve davetler artık geçersiz
        await this.cancelOpen(tx, userId);
        return office.id;
      });
      return this.mine(userId).then((m) => ({ id: officeId, ...m }));
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw conflict('ALREADY_IN_OFFICE', 'Zaten bir ofise bağlısınız');
      }
      throw e;
    }
  }

  /** Danışmanın ofis durumu: üyeliği, açık talepleri ve gelen davetler. */
  async mine(userId: string) {
    const rows = await this.db
      .select({
        membershipId: officeMemberships.id,
        status: officeMemberships.status,
        role: officeMemberships.role,
        createdAt: officeMemberships.createdAt,
        office: {
          id: offices.id,
          name: offices.name,
          city: offices.city,
          district: offices.district,
          status: offices.status,
          rejectionReason: offices.rejectionReason,
        },
      })
      .from(officeMemberships)
      .innerJoin(offices, eq(offices.id, officeMemberships.officeId))
      .where(
        and(
          eq(officeMemberships.userId, userId),
          inArray(officeMemberships.status, ['active', ...OPEN]),
        ),
      )
      .orderBy(desc(officeMemberships.createdAt));

    const active = rows.find((r) => r.status === 'active') ?? null;
    return {
      membership: active && {
        membershipId: active.membershipId,
        role: active.role,
        office: active.office,
      },
      /** Ofisi yoksa "Bağımsız Danışman" olarak gösterilir */
      independent: !active || active.office.status !== 'active',
      requests: rows
        .filter((r) => r.status === 'requested')
        .map(({ membershipId, office, createdAt }) => ({ membershipId, office, createdAt })),
      invitations: rows
        .filter((r) => r.status === 'invited')
        .map(({ membershipId, office, createdAt }) => ({ membershipId, office, createdAt })),
    };
  }

  async search(q: string | undefined, city: string | undefined, limit: number) {
    const conds = [eq(offices.status, 'active')];
    const term = q?.trim();
    if (term) {
      const like = `%${term.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
      conds.push(or(ilike(offices.name, like), ilike(offices.legalName, like))!);
    }
    if (city?.trim()) conds.push(ilike(offices.city, city.trim()));

    return this.db
      .select({
        id: offices.id,
        name: offices.name,
        city: offices.city,
        district: offices.district,
        // Dış sorgudaki ofise açıkça "offices"."id" ile bağlanır; aksi halde
        // alt sorgudaki "id" üyelik tablosunun kendi kimliğine çözülür.
        memberCount: sql<number>`(
          select count(*)::int from office_memberships m
          where m.office_id = "offices"."id" and m.status = 'active'
        )`,
      })
      .from(offices)
      .where(and(...conds))
      .orderBy(asc(offices.name))
      .limit(limit);
  }

  /**
   * Ofis profili. Aktif ofisleri herkes görür; bekleyen/reddedilen ofisi
   * yalnızca üyeleri ve yöneticiler görür.
   */
  async profile(officeId: string, viewer: { id: string; role: string | null }) {
    const office = await this.officeOrThrow(this.db, officeId);
    if (office.status !== 'active' && viewer.role !== 'admin') {
      const m = await this.activeMembership(this.db, viewer.id);
      if (m?.officeId !== officeId) throw new NotFoundException('Ofis bulunamadı');
    }
    const members = await this.db
      .select({
        userId: users.id,
        fullName: users.fullName,
        role: officeMemberships.role,
        verificationStatus: agentProfiles.verificationStatus,
        since: officeMemberships.decidedAt,
      })
      .from(officeMemberships)
      .innerJoin(users, eq(users.id, officeMemberships.userId))
      .leftJoin(agentProfiles, eq(agentProfiles.userId, users.id))
      .where(and(eq(officeMemberships.officeId, officeId), eq(officeMemberships.status, 'active')))
      .orderBy(
        sql`case ${officeMemberships.role} when 'owner' then 0 when 'manager' then 1 else 2 end`,
        asc(users.fullName),
      );

    return {
      id: office.id,
      name: office.name,
      legalName: office.legalName,
      city: office.city,
      district: office.district,
      address: office.address,
      phone: office.phone,
      email: office.email,
      status: office.status,
      members: members.map(({ verificationStatus, ...m }) => ({
        ...m,
        isVerified: verificationStatus === 'approved',
      })),
    };
  }

  async requestJoin(userId: string, officeId: string) {
    await this.assertApprovedAgent(userId);
    const office = await this.officeOrThrow(this.db, officeId);
    if (office.status !== 'active') {
      throw conflict('OFFICE_NOT_ACTIVE', 'Bu ofis henüz katılıma açık değil');
    }
    await this.assertCanJoin(this.db, userId, officeId);

    const requester = await this.userName(userId);
    try {
      await this.db.transaction(async (tx) => {
        const [m] = await tx
          .insert(officeMemberships)
          .values({ officeId, userId, role: 'agent', status: 'requested' })
          .returning({ id: officeMemberships.id });
        await this.notifyManagers(tx, officeId, {
          type: 'office.join_requested',
          title: 'Yeni katılma talebi',
          body: `${requester} ${office.name} ofisine katılmak istiyor.`,
          data: { officeId, membershipId: m.id },
        });
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw conflict('ALREADY_PENDING', 'Bu ofisle bekleyen bir talep veya davetiniz var');
      }
      throw e;
    }
    return this.mine(userId);
  }

  async cancelRequest(userId: string, membershipId: string) {
    const [row] = await this.db
      .update(officeMemberships)
      .set({ status: 'cancelled', decidedAt: new Date(), decidedBy: userId })
      .where(
        and(
          eq(officeMemberships.id, membershipId),
          eq(officeMemberships.userId, userId),
          eq(officeMemberships.status, 'requested'),
        ),
      )
      .returning({ id: officeMemberships.id });
    if (!row) throw new NotFoundException('Bekleyen talep bulunamadı');
    return this.mine(userId);
  }

  async acceptInvitation(userId: string, membershipId: string) {
    await this.assertApprovedAgent(userId);
    await this.guardConcurrent(() => this.db.transaction(async (tx) => {
      const m = await this.openMembershipOrThrow(tx, membershipId, 'invited');
      if (m.userId !== userId) throw new NotFoundException('Davet bulunamadı');
      const office = await this.officeOrThrow(tx, m.officeId);
      if (office.status !== 'active') {
        throw conflict('OFFICE_NOT_ACTIVE', 'Bu ofis şu an aktif değil');
      }
      await this.activate(tx, m, office, userId);
      const name = await this.userName(userId, tx);
      await this.notifyManagers(tx, office.id, {
        type: 'office.invite_accepted',
        title: 'Davet kabul edildi',
        body: `${name} ${office.name} ekibine katıldı.`,
        data: { officeId: office.id, userId },
      });
    }));
    return this.mine(userId);
  }

  async declineInvitation(userId: string, membershipId: string) {
    await this.db.transaction(async (tx) => {
      const m = await this.openMembershipOrThrow(tx, membershipId, 'invited');
      if (m.userId !== userId) throw new NotFoundException('Davet bulunamadı');
      await tx
        .update(officeMemberships)
        .set({ status: 'declined', decidedAt: new Date(), decidedBy: userId })
        .where(eq(officeMemberships.id, m.id));
      const office = await this.officeOrThrow(tx, m.officeId);
      const name = await this.userName(userId, tx);
      await this.notifyManagers(tx, office.id, {
        type: 'office.invite_declined',
        title: 'Davet reddedildi',
        body: `${name} ${office.name} davetini kabul etmedi.`,
        data: { officeId: office.id, userId },
      });
    });
    return this.mine(userId);
  }

  /** Danışman ofisten ayrılır ve "Bağımsız Danışman" olur. */
  async leave(userId: string) {
    await this.db.transaction(async (tx) => {
      const m = await this.activeMembership(tx, userId, true);
      if (!m) throw new NotFoundException('Bir ofise bağlı değilsiniz');
      if (m.role === 'owner') {
        throw conflict(
          'OWNER_CANNOT_LEAVE',
          'Ofis sahibi ayrılmadan önce sahipliği başka bir üyeye devretmelidir',
        );
      }
      await tx
        .update(officeMemberships)
        .set({ status: 'left', endedAt: new Date() })
        .where(eq(officeMemberships.id, m.id));
      const office = await this.officeOrThrow(tx, m.officeId);
      const name = await this.userName(userId, tx);
      await this.notifyManagers(tx, office.id, {
        type: 'office.member_left',
        title: 'Ekipten ayrılış',
        body: `${name} ${office.name} ofisinden ayrıldı.`,
        data: { officeId: office.id, userId },
      });
    });
    return this.mine(userId);
  }

  // -------------------------------------------------------------------------
  // Ofis yönetimi (sahip / yönetici)
  // -------------------------------------------------------------------------

  async manage(actorId: string, officeId: string) {
    const role = await this.assertManager(this.db, actorId, officeId);
    const office = await this.officeOrThrow(this.db, officeId);
    const rows = await this.db
      .select({
        membershipId: officeMemberships.id,
        userId: users.id,
        fullName: users.fullName,
        phone: users.phone,
        role: officeMemberships.role,
        status: officeMemberships.status,
        verificationStatus: agentProfiles.verificationStatus,
        createdAt: officeMemberships.createdAt,
        decidedAt: officeMemberships.decidedAt,
      })
      .from(officeMemberships)
      .innerJoin(users, eq(users.id, officeMemberships.userId))
      .leftJoin(agentProfiles, eq(agentProfiles.userId, users.id))
      .where(
        and(
          eq(officeMemberships.officeId, officeId),
          inArray(officeMemberships.status, ['active', ...OPEN]),
        ),
      )
      .orderBy(asc(officeMemberships.createdAt));

    const shape = ({ verificationStatus, status: _s, ...r }: (typeof rows)[number]) => ({
      ...r,
      isVerified: verificationStatus === 'approved',
    });
    return {
      myRole: role,
      office: {
        id: office.id,
        name: office.name,
        legalName: office.legalName,
        licenseNumber: office.licenseNumber,
        city: office.city,
        district: office.district,
        address: office.address,
        phone: office.phone,
        email: office.email,
        status: office.status,
        rejectionReason: office.rejectionReason,
      },
      members: rows.filter((r) => r.status === 'active').map(shape),
      requests: rows.filter((r) => r.status === 'requested').map(shape),
      invitations: rows.filter((r) => r.status === 'invited').map(shape),
    };
  }

  async update(actorId: string, officeId: string, dto: UpdateOfficeDto) {
    await this.assertManager(this.db, actorId, officeId);
    await this.db
      .update(offices)
      .set({
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.address !== undefined && { address: dto.address.trim() || null }),
        ...(dto.phone !== undefined && { phone: dto.phone.trim() || null }),
        ...(dto.email !== undefined && { email: dto.email.toLowerCase() || null }),
      })
      .where(eq(offices.id, officeId));
    return this.manage(actorId, officeId);
  }

  async approveRequest(actorId: string, officeId: string, membershipId: string) {
    await this.guardConcurrent(() => this.db.transaction(async (tx) => {
      await this.assertManager(tx, actorId, officeId);
      const m = await this.openMembershipOrThrow(tx, membershipId, 'requested');
      if (m.officeId !== officeId) throw new NotFoundException('Talep bulunamadı');
      const office = await this.officeOrThrow(tx, officeId);
      await this.activate(tx, m, office, actorId);
      await this.notifications.notify(
        {
          userId: m.userId,
          type: 'office.request_approved',
          title: 'Katılma talebin onaylandı',
          body: `Artık ${office.name} ekibindesin.`,
          data: { officeId },
        },
        tx,
      );
    }));
    return this.manage(actorId, officeId);
  }

  async declineRequest(actorId: string, officeId: string, membershipId: string) {
    await this.db.transaction(async (tx) => {
      await this.assertManager(tx, actorId, officeId);
      const m = await this.openMembershipOrThrow(tx, membershipId, 'requested');
      if (m.officeId !== officeId) throw new NotFoundException('Talep bulunamadı');
      await tx
        .update(officeMemberships)
        .set({ status: 'declined', decidedAt: new Date(), decidedBy: actorId })
        .where(eq(officeMemberships.id, m.id));
      const office = await this.officeOrThrow(tx, officeId);
      await this.notifications.notify(
        {
          userId: m.userId,
          type: 'office.request_declined',
          title: 'Katılma talebin sonuçlandı',
          body: `${office.name} katılma talebini kabul etmedi.`,
          data: { officeId },
        },
        tx,
      );
    });
    return this.manage(actorId, officeId);
  }

  /** Onaylı bir danışmanı telefon numarasıyla davet eder. */
  async invite(actorId: string, officeId: string, phoneInput: string) {
    await this.assertManager(this.db, actorId, officeId);
    const office = await this.officeOrThrow(this.db, officeId);
    if (office.status !== 'active') {
      throw conflict('OFFICE_NOT_ACTIVE', 'Ofis onaylanmadan davet gönderilemez');
    }
    const phone = normalizeTrPhone(phoneInput);
    if (!phone) {
      throw new BadRequestException({
        code: 'PHONE_INVALID',
        message: 'Geçerli bir cep telefonu numarası girin',
      });
    }
    const [target] = await this.db
      .select({ id: users.id, role: users.role, status: agentProfiles.verificationStatus })
      .from(users)
      .leftJoin(agentProfiles, eq(agentProfiles.userId, users.id))
      .where(and(eq(users.phone, phone), eq(users.status, 'active')))
      .limit(1);
    if (!target || target.role !== 'agent' || target.status !== 'approved') {
      throw new NotFoundException({
        code: 'AGENT_NOT_FOUND',
        message: 'Bu numarayla kayıtlı onaylı bir danışman bulunamadı',
      });
    }
    await this.assertCanJoin(this.db, target.id, officeId);

    try {
      await this.db.transaction(async (tx) => {
        const [m] = await tx
          .insert(officeMemberships)
          .values({ officeId, userId: target.id, role: 'agent', status: 'invited', invitedBy: actorId })
          .returning({ id: officeMemberships.id });
        await this.notifications.notify(
          {
            userId: target.id,
            type: 'office.invited',
            title: 'Ofis daveti',
            body: `${office.name} seni ekibine davet etti.`,
            data: { officeId, membershipId: m.id },
          },
          tx,
        );
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw conflict('ALREADY_PENDING', 'Bu danışmanla bekleyen bir talep veya davet var');
      }
      throw e;
    }
    return this.manage(actorId, officeId);
  }

  async cancelInvitation(actorId: string, officeId: string, membershipId: string) {
    await this.assertManager(this.db, actorId, officeId);
    const [row] = await this.db
      .update(officeMemberships)
      .set({ status: 'cancelled', decidedAt: new Date(), decidedBy: actorId })
      .where(
        and(
          eq(officeMemberships.id, membershipId),
          eq(officeMemberships.officeId, officeId),
          eq(officeMemberships.status, 'invited'),
        ),
      )
      .returning({ id: officeMemberships.id });
    if (!row) throw new NotFoundException('Bekleyen davet bulunamadı');
    return this.manage(actorId, officeId);
  }

  /** Yalnızca sahip: bir üyeyi yönetici yapar veya yöneticiliği kaldırır. */
  async changeRole(actorId: string, officeId: string, userId: string, role: 'manager' | 'agent') {
    await this.db.transaction(async (tx) => {
      const actorRole = await this.assertManager(tx, actorId, officeId);
      if (actorRole !== 'owner') throw new ForbiddenException('Rolleri yalnızca ofis sahibi değiştirebilir');
      const m = await this.memberOrThrow(tx, officeId, userId);
      if (m.role === 'owner') throw conflict('OWNER_ROLE', 'Sahibin rolü değiştirilemez');
      if (m.role === role) return;
      await tx.update(officeMemberships).set({ role }).where(eq(officeMemberships.id, m.id));
      const office = await this.officeOrThrow(tx, officeId);
      await this.notifications.notify(
        {
          userId,
          type: 'office.role_changed',
          title: 'Rolün değişti',
          body:
            role === 'manager'
              ? `${office.name} ofisinde artık yöneticisin.`
              : `${office.name} ofisindeki yöneticilik yetkin kaldırıldı.`,
          data: { officeId, role },
        },
        tx,
      );
    });
    return this.manage(actorId, officeId);
  }

  /** Sahip herkesi, yönetici yalnızca danışmanları çıkarabilir. */
  async removeMember(actorId: string, officeId: string, userId: string) {
    await this.db.transaction(async (tx) => {
      const actorRole = await this.assertManager(tx, actorId, officeId);
      const m = await this.memberOrThrow(tx, officeId, userId);
      if (m.role === 'owner') throw conflict('OWNER_ROLE', 'Ofis sahibi çıkarılamaz');
      if (actorRole === 'manager' && m.role !== 'agent') {
        throw new ForbiddenException('Yöneticileri yalnızca ofis sahibi çıkarabilir');
      }
      await tx
        .update(officeMemberships)
        .set({ status: 'removed', endedAt: new Date(), decidedBy: actorId })
        .where(eq(officeMemberships.id, m.id));
      const office = await this.officeOrThrow(tx, officeId);
      await this.notifications.notify(
        {
          userId,
          type: 'office.member_removed',
          title: 'Ofis üyeliğin sona erdi',
          body: `${office.name} ekibinden çıkarıldın. Artık Bağımsız Danışman olarak görünüyorsun.`,
          data: { officeId },
        },
        tx,
      );
    });
    return this.manage(actorId, officeId);
  }

  /** Sahiplik devri: sahip yönetici olur, seçilen üye sahip olur. */
  async transferOwnership(actorId: string, officeId: string, userId: string) {
    if (actorId === userId) throw new BadRequestException('Zaten ofis sahibisiniz');
    await this.db.transaction(async (tx) => {
      const actorRole = await this.assertManager(tx, actorId, officeId);
      if (actorRole !== 'owner') throw new ForbiddenException('Sahipliği yalnızca ofis sahibi devredebilir');
      const target = await this.memberOrThrow(tx, officeId, userId);
      await tx
        .update(officeMemberships)
        .set({ role: 'manager' })
        .where(and(eq(officeMemberships.officeId, officeId), eq(officeMemberships.userId, actorId), eq(officeMemberships.status, 'active')));
      await tx.update(officeMemberships).set({ role: 'owner' }).where(eq(officeMemberships.id, target.id));
      await tx.update(offices).set({ ownerId: userId }).where(eq(offices.id, officeId));
      const office = await this.officeOrThrow(tx, officeId);
      await this.notifications.notify(
        {
          userId,
          type: 'office.role_changed',
          title: 'Ofis sahipliği sana devredildi',
          body: `Artık ${office.name} ofisinin sahibisin.`,
          data: { officeId, role: 'owner' },
        },
        tx,
      );
    });
    return this.manage(actorId, officeId);
  }

  // -------------------------------------------------------------------------
  // Yönetici (admin) incelemesi
  // -------------------------------------------------------------------------

  async adminList(status: OfficeStatus, limit: number, offset: number) {
    const where = eq(offices.status, status);
    const items = await this.db
      .select({
        id: offices.id,
        name: offices.name,
        legalName: offices.legalName,
        licenseNumber: offices.licenseNumber,
        city: offices.city,
        district: offices.district,
        status: offices.status,
        createdAt: offices.createdAt,
        reviewedAt: offices.reviewedAt,
        owner: { id: users.id, fullName: users.fullName, phone: users.phone },
      })
      .from(offices)
      .innerJoin(users, eq(users.id, offices.ownerId))
      .where(where)
      .orderBy(status === 'pending' ? asc(offices.createdAt) : desc(offices.updatedAt))
      .limit(limit)
      .offset(offset);
    const [{ total }] = await this.db.select({ total: count() }).from(offices).where(where);
    return { items, total, limit, offset };
  }

  async adminCounts() {
    const rows = await this.db
      .select({ status: offices.status, total: count() })
      .from(offices)
      .groupBy(offices.status);
    const result: Record<OfficeStatus, number> = { pending: 0, active: 0, rejected: 0, suspended: 0 };
    for (const r of rows) result[r.status] = r.total;
    return result;
  }

  async adminDetail(officeId: string) {
    const office = await this.officeOrThrow(this.db, officeId);
    const [owner] = await this.db
      .select({
        id: users.id,
        fullName: users.fullName,
        phone: users.phone,
        email: users.email,
        verificationStatus: agentProfiles.verificationStatus,
        licenseNumber: agentProfiles.licenseNumber,
        businessName: agentProfiles.businessName,
      })
      .from(users)
      .leftJoin(agentProfiles, eq(agentProfiles.userId, users.id))
      .where(eq(users.id, office.ownerId));
    const [{ members }] = await this.db
      .select({ members: count() })
      .from(officeMemberships)
      .where(and(eq(officeMemberships.officeId, officeId), eq(officeMemberships.status, 'active')));
    return {
      ...office,
      owner: {
        ...owner,
        // Danışman başvurusundaki belge no ile ofis belge no'su eşleşiyor mu
        licenseMatches:
          !!owner?.licenseNumber &&
          owner.licenseNumber.replace(/\s/g, '') === office.licenseNumber.replace(/\s/g, ''),
      },
      memberCount: members,
    };
  }

  async adminApprove(adminId: string, officeId: string) {
    await this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(offices)
        .set({ status: 'active', reviewedAt: new Date(), reviewedBy: adminId, rejectionReason: null })
        .where(and(eq(offices.id, officeId), eq(offices.status, 'pending')))
        .returning();
      if (!updated) throw this.notPending();
      await this.notifications.notify(
        {
          userId: updated.ownerId,
          type: 'office.approved',
          title: 'Ofisin onaylandı',
          body: `${updated.name} artık Emlook'ta. Ekibini davet edebilirsin.`,
          data: { officeId },
        },
        tx,
      );
    });
    await this.audit.log({ actorId: adminId, action: 'office.approved', targetType: 'office', targetId: officeId });
    return this.adminDetail(officeId);
  }

  async adminReject(adminId: string, officeId: string, reason: string) {
    await this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(offices)
        .set({
          status: 'rejected',
          reviewedAt: new Date(),
          reviewedBy: adminId,
          rejectionReason: reason.trim(),
        })
        .where(and(eq(offices.id, officeId), eq(offices.status, 'pending')))
        .returning();
      if (!updated) throw this.notPending();
      // Sahip bağımsız danışmana döner; düzeltip yeni başvuru yapabilir.
      await tx
        .update(officeMemberships)
        .set({ status: 'left', endedAt: new Date() })
        .where(and(eq(officeMemberships.officeId, officeId), eq(officeMemberships.status, 'active')));
      await this.notifications.notify(
        {
          userId: updated.ownerId,
          type: 'office.rejected',
          title: 'Ofis başvurun sonuçlandı',
          body: `${updated.name} onaylanmadı. Gerekçe: ${reason.trim()}`,
          data: { officeId },
        },
        tx,
      );
    });
    await this.audit.log({
      actorId: adminId,
      action: 'office.rejected',
      targetType: 'office',
      targetId: officeId,
      metadata: { reason: reason.trim() },
    });
    return this.adminDetail(officeId);
  }

  // -------------------------------------------------------------------------
  // Yardımcılar
  // -------------------------------------------------------------------------

  /**
   * Aynı danışmanın iki üyeliği eşzamanlı aktifleşirse veritabanı ikincisini
   * benzersizlik indeksiyle durdurur; bunu anlaşılır bir 409'a çeviririz.
   */
  private async guardConcurrent<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw conflict(
          'CONCURRENT_CHANGE',
          'Danışmanın ofis üyeliği aynı anda değişti; sayfayı yenileyip tekrar deneyin',
        );
      }
      throw e;
    }
  }

  /**
   * Talep/daveti aktif üyeliğe çevirir. Danışman başka bir ofisteyse oradan
   * ayrılmış sayılır (transfer) ve eski ofise bildirim gider.
   */
  private async activate(tx: Tx, m: OfficeMembership, office: Office, actorId: string) {
    const previous = await this.activeMembership(tx, m.userId, true);
    if (previous && previous.officeId !== office.id) {
      if (previous.role === 'owner') {
        throw conflict(
          'OWNER_CANNOT_LEAVE',
          'Ofis sahibi başka ofise geçmeden önce sahipliği devretmelidir',
        );
      }
      await tx
        .update(officeMemberships)
        .set({ status: 'left', endedAt: new Date() })
        .where(eq(officeMemberships.id, previous.id));
      const name = await this.userName(m.userId, tx);
      await this.notifyManagers(tx, previous.officeId, {
        type: 'office.member_transferred',
        title: 'Ekipten ayrılış',
        body: `${name} başka bir ofise geçti.`,
        data: { officeId: previous.officeId, userId: m.userId },
      });
    }
    await tx
      .update(officeMemberships)
      .set({ status: 'active', decidedAt: new Date(), decidedBy: actorId })
      .where(eq(officeMemberships.id, m.id));
    await this.cancelOpen(tx, m.userId, m.id);
    await this.audit.log(
      {
        actorId,
        action: previous ? 'office.member_transferred' : 'office.member_joined',
        targetType: 'office',
        targetId: office.id,
        metadata: { userId: m.userId, fromOfficeId: previous?.officeId ?? null },
      },
      tx,
    );
  }

  /** Kullanıcının diğer açık talep ve davetlerini geri çeker. */
  private async cancelOpen(tx: Conn, userId: string, exceptId?: string) {
    const conds = [eq(officeMemberships.userId, userId), inArray(officeMemberships.status, [...OPEN])];
    if (exceptId) conds.push(ne(officeMemberships.id, exceptId));
    await tx
      .update(officeMemberships)
      .set({ status: 'cancelled', decidedAt: new Date() })
      .where(and(...conds));
  }

  private async notifyManagers(
    tx: Conn,
    officeId: string,
    n: Omit<NewNotification, 'userId'>,
  ) {
    const managers = await tx
      .select({ userId: officeMemberships.userId })
      .from(officeMemberships)
      .where(
        and(
          eq(officeMemberships.officeId, officeId),
          eq(officeMemberships.status, 'active'),
          inArray(officeMemberships.role, ['owner', 'manager']),
        ),
      );
    await this.notifications.notify(
      managers.map((m) => ({ ...n, userId: m.userId })),
      tx,
    );
  }

  private async assertApprovedAgent(userId: string) {
    const [row] = await this.db
      .select({ role: users.role, status: agentProfiles.verificationStatus })
      .from(users)
      .leftJoin(agentProfiles, eq(agentProfiles.userId, users.id))
      .where(eq(users.id, userId));
    if (row?.role !== 'agent' || row.status !== 'approved') {
      throw new ForbiddenException({
        code: 'NOT_VERIFIED',
        message: 'Bu işlem için onaylı danışman olmanız gerekiyor',
      });
    }
  }

  private async assertCanJoin(conn: Conn, userId: string, officeId: string) {
    const current = await this.activeMembership(conn, userId);
    if (current?.officeId === officeId) {
      throw conflict('ALREADY_MEMBER', 'Danışman zaten bu ofisin üyesi');
    }
    if (current?.role === 'owner') {
      throw conflict(
        'OWNER_CANNOT_LEAVE',
        'Başka bir ofisin sahibi olan danışman sahipliği devretmeden katılamaz',
      );
    }
  }

  /** Aktif sahip veya yönetici değilse 403. */
  private async assertManager(conn: Conn, userId: string, officeId: string): Promise<OfficeRole> {
    const m = await this.activeMembership(conn, userId);
    if (!m || m.officeId !== officeId || m.role === 'agent') {
      throw new ForbiddenException('Bu ofisi yönetme yetkiniz yok');
    }
    return m.role;
  }

  private async activeMembership(conn: Conn, userId: string, lock = false) {
    const q = conn
      .select()
      .from(officeMemberships)
      .where(and(eq(officeMemberships.userId, userId), eq(officeMemberships.status, 'active')))
      .limit(1);
    const [row] = lock ? await q.for('update') : await q;
    return row ?? null;
  }

  private async memberOrThrow(conn: Conn, officeId: string, userId: string) {
    const [m] = await conn
      .select()
      .from(officeMemberships)
      .where(
        and(
          eq(officeMemberships.officeId, officeId),
          eq(officeMemberships.userId, userId),
          eq(officeMemberships.status, 'active'),
        ),
      )
      .for('update');
    if (!m) throw new NotFoundException('Üye bulunamadı');
    return m;
  }

  private async openMembershipOrThrow(tx: Tx, id: string, status: 'requested' | 'invited') {
    const [m] = await tx
      .select()
      .from(officeMemberships)
      .where(and(eq(officeMemberships.id, id), eq(officeMemberships.status, status)))
      .for('update');
    if (!m) {
      throw new NotFoundException(status === 'invited' ? 'Davet bulunamadı' : 'Talep bulunamadı');
    }
    return m;
  }

  private async officeOrThrow(conn: Conn, officeId: string): Promise<Office> {
    const [office] = await conn.select().from(offices).where(eq(offices.id, officeId)).limit(1);
    if (!office) throw new NotFoundException('Ofis bulunamadı');
    return office;
  }

  private async userName(userId: string, conn: Conn = this.db) {
    const [u] = await conn.select({ fullName: users.fullName }).from(users).where(eq(users.id, userId));
    return u?.fullName ?? 'Bir danışman';
  }

  private notPending() {
    return conflict('NOT_PENDING', 'Yalnızca incelemedeki ofisler onaylanabilir veya reddedilebilir');
  }
}
