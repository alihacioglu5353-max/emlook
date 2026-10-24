import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, inArray, ne, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { isUniqueViolation } from '../common/db-errors.js';
import { InjectDb, type Database } from '../db/db.module.js';
import {
  agentProfiles,
  cities,
  districts,
  interests,
  listings,
  listingSwipes,
  users,
  type Interest,
  type InterestStatus,
} from '../db/schema.js';
import { listingCards, photoPath, visibleActive, type Viewer } from '../listings/listing-cards.js';
import { ListingsService } from '../listings/listings.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { DiscoverQuery, InterestListQuery, SwipeDto } from './dto.js';

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

/** Son kaydırma bu süre içinde geri alınabilir */
export const UNDO_WINDOW_MS = 10 * 60 * 1000;

@Injectable()
export class DiscoverService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly listings: ListingsService,
    private readonly notifications: NotificationsService,
  ) {}

  // ---- Keşfet kartları ----

  /**
   * Henüz karar verilmemiş, görebildiğin yayındaki ilanlar; kural tabanlı puanla sıralanır:
   *  aynı il +30, aynı ilçe +20 (danışman profilindeki bölgeye göre), ağındaki danışman +15,
   *  EİDS onaylı +10, 3+ fotoğraf +5, paylaşım oranı /10 (danışmanlar için),
   *  tazelik 0–30 (yayından bu yana geçen gün sayısı kadar azalır).
   */
  async cards(viewer: Viewer, q: DiscoverQuery) {
    const [profile] = await this.db
      .select({ city: agentProfiles.city, district: agentProfiles.district })
      .from(agentProfiles)
      .where(eq(agentProfiles.userId, viewer.id));
    const city = profile?.city ?? null;
    const district = profile?.district ?? null;
    const isAgent = viewer.role === 'agent';

    const score = sql<number>`(
      (case when ${city}::text is not null and (select c.name from cities c where c.code = "listings"."city_code") = ${city} then 30 else 0 end)
      + (case when ${district}::text is not null and (select d.name from districts d where d.id = "listings"."district_id") = ${district} then 20 else 0 end)
      + (case when exists (select 1 from follows f where f.follower_id = ${viewer.id} and f.followee_id = "listings"."owner_id")
              or exists (select 1 from office_memberships a join office_memberships b on b.office_id = a.office_id
                         where a.user_id = ${viewer.id} and a.status = 'active'
                           and b.user_id = "listings"."owner_id" and b.status = 'active')
         then 15 else 0 end)
      + (case when "listings"."eids_status" = 'verified' then 10 else 0 end)
      + (case when (select count(*) from listing_photos p where p.listing_id = "listings"."id") >= 3 then 5 else 0 end)
      + (case when ${isAgent}::boolean then "listings"."cobroke_share" / 10 else 0 end)
      + greatest(0, 30 - extract(day from now() - "listings"."published_at"))::int
    )`;

    const conds: SQL[] = [
      visibleActive(viewer),
      ne(listings.ownerId, viewer.id),
      eq(users.status, 'active'),
      sql`not exists (select 1 from listing_swipes s where s.user_id = ${viewer.id} and s.listing_id = "listings"."id")`,
    ];
    if (q.dealType) conds.push(eq(listings.dealType, q.dealType));
    if (q.cityCode) conds.push(eq(listings.cityCode, q.cityCode));

    const items = await listingCards(this.db, viewer, {
      where: and(...conds)!,
      orderBy: [desc(score), desc(listings.publishedAt), desc(listings.id)],
      limit: q.limit ?? 10,
    });
    const undo = await this.lastUndoable(viewer.id);
    return { items, canUndo: !!undo };
  }

  // ---- Kaydırma ----

  async swipe(viewer: Viewer, listingId: string, dto: SwipeDto) {
    const listing = await this.listings.assertCanView(viewer, listingId);
    if (listing.ownerId === viewer.id) {
      throw new BadRequestException({ code: 'OWN_LISTING', message: 'Kendi ilanında karar veremezsin' });
    }
    if (listing.status !== 'active') {
      throw new BadRequestException({ code: 'LISTING_NOT_ACTIVE', message: 'İlan artık yayında değil' });
    }
    try {
      return await this.db.transaction(async (tx) => {
        const [swipe] = await tx
          .insert(listingSwipes)
          .values({ userId: viewer.id, listingId, decision: dto.decision })
          .returning();
        const interest =
          dto.decision === 'like'
            ? await this.openInterest(tx, viewer.id, listing, dto.note, swipe.id)
            : null;
        return { decision: swipe.decision, interest: interest && this.brief(interest) };
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new ConflictException({ code: 'ALREADY_SWIPED', message: 'Bu ilan için zaten karar verdin' });
      }
      throw e;
    }
  }

  /** Son kaydırmayı geri alır; beğeniden doğan ilgi hâlâ bekliyorsa geri çekilir. */
  async undo(viewer: Viewer) {
    const last = await this.lastUndoable(viewer.id);
    if (!last) {
      throw new BadRequestException({ code: 'NOTHING_TO_UNDO', message: 'Geri alınacak bir karar yok' });
    }
    await this.db.transaction(async (tx) => {
      await tx
        .update(interests)
        .set({ status: 'withdrawn', decidedAt: new Date() })
        .where(and(eq(interests.swipeId, last.id), eq(interests.status, 'pending')));
      await tx.delete(listingSwipes).where(eq(listingSwipes.id, last.id));
    });
    const [card] = await listingCards(this.db, viewer, {
      where: and(eq(listings.id, last.listingId), visibleActive(viewer))!,
      orderBy: [],
      limit: 1,
    });
    return { restored: card ?? null, canUndo: !!(await this.lastUndoable(viewer.id)) };
  }

  private async lastUndoable(userId: string) {
    const [row] = await this.db
      .select()
      .from(listingSwipes)
      .where(
        and(
          eq(listingSwipes.userId, userId),
          sql`${listingSwipes.createdAt} > now() - make_interval(secs => ${UNDO_WINDOW_MS / 1000})`,
        ),
      )
      .orderBy(desc(listingSwipes.createdAt))
      .limit(1);
    return row ?? null;
  }

  // ---- İlgi (el sıkışma) ----

  /** İlan detayındaki "İlgileniyorum" */
  async express(viewer: Viewer, listingId: string, note?: string) {
    const listing = await this.listings.assertCanView(viewer, listingId);
    if (listing.ownerId === viewer.id) {
      throw new BadRequestException({ code: 'OWN_LISTING', message: 'Kendi ilanına ilgi gösteremezsin' });
    }
    if (listing.status !== 'active') {
      throw new BadRequestException({ code: 'LISTING_NOT_ACTIVE', message: 'İlan artık yayında değil' });
    }
    const interest = await this.db.transaction((tx) => this.openInterest(tx, viewer.id, listing, note));
    return this.detail(viewer.id, interest.id);
  }

  /** Bu ilana açık/kabul edilmiş ilgim (yoksa null) */
  async mine(viewerId: string, listingId: string) {
    const [row] = await this.db
      .select({ id: interests.id })
      .from(interests)
      .where(
        and(
          eq(interests.listingId, listingId),
          eq(interests.requesterId, viewerId),
          inArray(interests.status, ['pending', 'accepted']),
        ),
      )
      .limit(1);
    return row ? this.detail(viewerId, row.id) : null;
  }

  async decide(viewer: Viewer, id: string, decision: 'accepted' | 'declined') {
    const row = await this.load(id);
    if (row.ownerId !== viewer.id) throw new ForbiddenException('Bu talebi yalnızca ilan sahibi yanıtlayabilir');
    if (row.status !== 'pending') {
      throw new ConflictException({ code: 'INTEREST_CLOSED', message: 'Bu talep artık açık değil' });
    }
    await this.db.transaction(async (tx) => {
      await tx.update(interests).set({ status: decision, decidedAt: new Date() }).where(eq(interests.id, id));
      const [{ title }] = await tx.select({ title: listings.title }).from(listings).where(eq(listings.id, row.listingId));
      const [{ fullName }] = await tx.select({ fullName: users.fullName }).from(users).where(eq(users.id, viewer.id));
      await this.notifications.notify(
        decision === 'accepted'
          ? {
              userId: row.requesterId,
              type: 'interest.accepted',
              title: 'Eşleştiniz',
              body: `${fullName ?? 'İlan sahibi'} "${title}" ilanı için ilgini kabul etti`,
              data: { interestId: id, listingId: row.listingId },
            }
          : {
              userId: row.requesterId,
              type: 'interest.declined',
              title: 'İlgin yanıtlandı',
              body: `"${title}" ilanı için ilgin şu an değerlendirilmiyor`,
              data: { interestId: id, listingId: row.listingId },
            },
        tx,
      );
    });
    return this.detail(viewer.id, id);
  }

  async withdraw(viewer: Viewer, id: string) {
    const row = await this.load(id);
    if (row.requesterId !== viewer.id) throw new ForbiddenException('Bu talebi yalnızca gönderen geri çekebilir');
    if (row.status !== 'pending') {
      throw new ConflictException({ code: 'INTEREST_CLOSED', message: 'Yalnızca bekleyen talep geri çekilebilir' });
    }
    await this.db
      .update(interests)
      .set({ status: 'withdrawn', decidedAt: new Date() })
      .where(eq(interests.id, id));
    return this.detail(viewer.id, id);
  }

  /** Gelen (ilan sahibi) veya giden (talep eden) ilgiler, sayılarla */
  async list(viewerId: string, side: 'incoming' | 'outgoing', q: InterestListQuery) {
    const mineCol = side === 'incoming' ? interests.ownerId : interests.requesterId;
    const conds: SQL[] = [eq(mineCol, viewerId)];
    if (q.status) conds.push(eq(interests.status, q.status));
    const items = await this.rows(and(...conds)!, 100);
    const countRows = await this.db
      .select({ status: interests.status, n: sql<number>`count(*)::int` })
      .from(interests)
      .where(eq(mineCol, viewerId))
      .groupBy(interests.status);
    const counts: Record<InterestStatus, number> = { pending: 0, accepted: 0, declined: 0, withdrawn: 0 };
    for (const r of countRows) counts[r.status] = r.n;
    return { items, counts };
  }

  async detail(viewerId: string, id: string) {
    const [row] = await this.rows(eq(interests.id, id), 1);
    if (!row || (row.owner.id !== viewerId && row.requester.id !== viewerId)) {
      throw new NotFoundException('Talep bulunamadı');
    }
    return row;
  }

  // ---- Yardımcılar ----

  /** Açık ilgi oluşturur; zaten açık/kabul edilmiş varsa onu döndürür. */
  private async openInterest(
    tx: Tx,
    requesterId: string,
    listing: { id: string; ownerId: string; title: string },
    note: string | undefined,
    swipeId?: string,
  ): Promise<Interest> {
    const [existing] = await tx
      .select()
      .from(interests)
      .where(
        and(
          eq(interests.listingId, listing.id),
          eq(interests.requesterId, requesterId),
          inArray(interests.status, ['pending', 'accepted']),
        ),
      )
      .limit(1);
    if (existing) return existing;

    const [created] = await tx
      .insert(interests)
      .values({
        listingId: listing.id,
        requesterId,
        ownerId: listing.ownerId,
        note: note?.trim() || null,
        swipeId: swipeId ?? null,
      })
      .returning();
    const [me] = await tx
      .select({ fullName: users.fullName, role: users.role })
      .from(users)
      .where(eq(users.id, requesterId));
    await this.notifications.notify(
      {
        userId: listing.ownerId,
        type: 'interest.received',
        title: me?.role === 'agent' ? 'Danışman ilgisi' : 'Yeni ilgi',
        body: `${me?.fullName ?? 'Bir kullanıcı'} "${listing.title}" ilanınla ilgileniyor`,
        data: { interestId: created.id, listingId: listing.id },
      },
      tx,
    );
    return created;
  }

  private async load(id: string) {
    const [row] = await this.db.select().from(interests).where(eq(interests.id, id)).limit(1);
    if (!row) throw new NotFoundException('Talep bulunamadı');
    return row;
  }

  private brief(i: Interest) {
    return { id: i.id, status: i.status, createdAt: i.createdAt };
  }

  private async rows(where: SQL, limit: number) {
    const requester = alias(users, 'requester');
    const owner = alias(users, 'owner');
    const reqProfile = alias(agentProfiles, 'req_profile');
    const rows = await this.db
      .select({
        id: interests.id,
        status: interests.status,
        note: interests.note,
        fromDiscover: sql<boolean>`${interests.swipeId} is not null`,
        createdAt: interests.createdAt,
        decidedAt: interests.decidedAt,
        listingId: listings.id,
        title: listings.title,
        dealType: listings.dealType,
        price: listings.price,
        listingStatus: listings.status,
        city: cities.name,
        district: districts.name,
        coverPhotoId: sql<string | null>`(
          select p.id from listing_photos p where p.listing_id = ${listings.id} order by p.position limit 1
        )`,
        requesterId: requester.id,
        requesterName: requester.fullName,
        requesterRole: requester.role,
        requesterVerified: sql<boolean>`${reqProfile.verificationStatus} = 'approved'`,
        ownerId: owner.id,
        ownerName: owner.fullName,
      })
      .from(interests)
      .innerJoin(listings, eq(listings.id, interests.listingId))
      .innerJoin(cities, eq(cities.code, listings.cityCode))
      .innerJoin(districts, eq(districts.id, listings.districtId))
      .innerJoin(requester, eq(requester.id, interests.requesterId))
      .leftJoin(reqProfile, eq(reqProfile.userId, interests.requesterId))
      .innerJoin(owner, eq(owner.id, interests.ownerId))
      .where(where)
      .orderBy(desc(interests.createdAt))
      .limit(limit);
    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      note: r.note,
      fromDiscover: r.fromDiscover,
      createdAt: r.createdAt,
      decidedAt: r.decidedAt,
      listing: {
        id: r.listingId,
        title: r.title,
        dealType: r.dealType,
        price: r.price,
        status: r.listingStatus,
        location: { city: r.city, district: r.district },
        coverPhoto: r.coverPhotoId ? photoPath(r.listingId, r.coverPhotoId) : null,
      },
      requester: {
        id: r.requesterId,
        fullName: r.requesterName,
        isAgent: r.requesterRole === 'agent',
        isVerified: r.requesterVerified ?? false,
      },
      owner: { id: r.ownerId, fullName: r.ownerName },
    }));
  }
}
