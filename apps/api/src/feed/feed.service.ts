import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, inArray, ne, sql, type SQL } from 'drizzle-orm';
import { InjectDb, type Database } from '../db/db.module.js';
import { agentProfiles, follows, listingLikes, listings, listingSaves, users } from '../db/schema.js';
import { listingCards, visibleActive, type Viewer } from '../listings/listing-cards.js';
import { ListingsService } from '../listings/listings.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { decodeCursor, encodeCursor } from './cursor.js';
import type { FeedQuery, PageQuery } from './dto.js';

const DEFAULT_LIMIT = 20;

/** Görüntüleyenin ağı: takip ettikleri + aynı ofisteki danışmanlar */
const inNetworkOf = (viewerId: string): SQL => sql`(
  exists (select 1 from follows f
          where f.follower_id = ${viewerId} and f.followee_id = "listings"."owner_id")
  or exists (select 1 from office_memberships a
             join office_memberships b on b.office_id = a.office_id
             where a.user_id = ${viewerId} and a.status = 'active'
               and b.user_id = "listings"."owner_id" and b.status = 'active')
)`;

@Injectable()
export class FeedService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly listings: ListingsService,
    private readonly notifications: NotificationsService,
  ) {}

  // ---- Akış ----

  /**
   * Emlook Ağı (scope=all): görebildiğin tüm yayındaki ilanlar.
   * Benim Ağım (scope=network): takip ettiğin ve ofis arkadaşlarının ilanları.
   * Kendi ilanların akışta yer almaz. En yeni yayın önce.
   */
  async feed(viewer: Viewer, q: FeedQuery) {
    const limit = q.limit ?? DEFAULT_LIMIT;
    const cursor = decodeCursor(q.cursor);
    const conds: SQL[] = [
      visibleActive(viewer),
      ne(listings.ownerId, viewer.id),
      eq(users.status, 'active'),
    ];
    if (q.scope === 'network') conds.push(inNetworkOf(viewer.id));
    if (q.dealType) conds.push(eq(listings.dealType, q.dealType));
    if (cursor) {
      conds.push(sql`("listings"."published_at", "listings"."id") < (${cursor.at.toISOString()}::timestamptz, ${cursor.id}::uuid)`);
    }
    const items = await listingCards(this.db, viewer, {
      where: and(...conds)!,
      orderBy: [desc(listings.publishedAt), desc(listings.id)],
      limit: limit + 1,
    });
    return this.page(items, limit, (x) => encodeCursor(x.publishedAt!, x.id));
  }

  /** Danışmanın yayındaki ilanları (profil sayfası) */
  async agentListings(viewer: Viewer, agentId: string, q: PageQuery) {
    const limit = q.limit ?? DEFAULT_LIMIT;
    const cursor = decodeCursor(q.cursor);
    const conds: SQL[] = [visibleActive(viewer), eq(listings.ownerId, agentId)];
    if (cursor) {
      conds.push(sql`("listings"."published_at", "listings"."id") < (${cursor.at.toISOString()}::timestamptz, ${cursor.id}::uuid)`);
    }
    const items = await listingCards(this.db, viewer, {
      where: and(...conds)!,
      orderBy: [desc(listings.publishedAt), desc(listings.id)],
      limit: limit + 1,
    });
    return this.page(items, limit, (x) => encodeCursor(x.publishedAt!, x.id));
  }

  /** Kaydettiğim ilanlar (hâlâ görebildiklerim), son kaydedilen önce */
  async saved(viewer: Viewer, q: PageQuery) {
    const limit = q.limit ?? DEFAULT_LIMIT;
    const cursor = decodeCursor(q.cursor);
    const conds: SQL[] = [eq(listingSaves.userId, viewer.id), visibleActive(viewer)];
    if (cursor) {
      conds.push(sql`(${listingSaves.createdAt}, ${listingSaves.listingId}) < (${cursor.at.toISOString()}::timestamptz, ${cursor.id}::uuid)`);
    }
    const saves = await this.db
      .select({ listingId: listingSaves.listingId, savedAt: listingSaves.createdAt })
      .from(listingSaves)
      .innerJoin(listings, eq(listings.id, listingSaves.listingId))
      .where(and(...conds))
      .orderBy(desc(listingSaves.createdAt), desc(listingSaves.listingId))
      .limit(limit + 1);
    if (saves.length === 0) return { items: [], nextCursor: null };

    const cards = await listingCards(this.db, viewer, {
      where: inArray(listings.id, saves.map((s) => s.listingId)),
      orderBy: [],
      limit: saves.length,
    });
    const byId = new Map(cards.map((c) => [c.id, c]));
    const ordered = saves
      .map((s) => ({ card: byId.get(s.listingId), savedAt: s.savedAt }))
      .filter((x): x is { card: NonNullable<typeof x.card>; savedAt: Date } => !!x.card);
    const hasMore = ordered.length > limit;
    const pageItems = ordered.slice(0, limit);
    const last = pageItems.at(-1);
    return {
      items: pageItems.map((x) => x.card),
      nextCursor: hasMore && last ? encodeCursor(last.savedAt, last.card.id) : null,
    };
  }

  // ---- Beğeni ve kaydetme ----

  async like(viewer: Viewer, listingId: string) {
    const listing = await this.listings.assertCanView(viewer, listingId);
    this.requireActive(listing.status);
    const inserted = await this.db
      .insert(listingLikes)
      .values({ listingId, userId: viewer.id })
      .onConflictDoNothing()
      .returning({ listingId: listingLikes.listingId });
    if (inserted.length > 0 && listing.ownerId !== viewer.id) {
      const [me] = await this.db.select({ fullName: users.fullName }).from(users).where(eq(users.id, viewer.id));
      await this.notifications.notify({
        userId: listing.ownerId,
        type: 'listing.liked',
        title: 'İlanın beğenildi',
        body: `${me?.fullName ?? 'Bir kullanıcı'} "${listing.title}" ilanını beğendi`,
        data: { listingId, userId: viewer.id },
      });
    }
    return this.reaction(viewer.id, listingId);
  }

  async unlike(viewer: Viewer, listingId: string) {
    await this.db
      .delete(listingLikes)
      .where(and(eq(listingLikes.listingId, listingId), eq(listingLikes.userId, viewer.id)));
    return this.reaction(viewer.id, listingId);
  }

  async save(viewer: Viewer, listingId: string) {
    const listing = await this.listings.assertCanView(viewer, listingId);
    this.requireActive(listing.status);
    await this.db.insert(listingSaves).values({ listingId, userId: viewer.id }).onConflictDoNothing();
    return this.reaction(viewer.id, listingId);
  }

  async unsave(viewer: Viewer, listingId: string) {
    await this.db
      .delete(listingSaves)
      .where(and(eq(listingSaves.listingId, listingId), eq(listingSaves.userId, viewer.id)));
    return this.reaction(viewer.id, listingId);
  }

  private async reaction(userId: string, listingId: string) {
    const {
      rows: [row],
    } = await this.db.execute<{ like_count: number; liked: boolean; saved: boolean }>(sql`
      select
        (select count(*)::int from listing_likes where listing_id = ${listingId}) as like_count,
        exists (select 1 from listing_likes where listing_id = ${listingId} and user_id = ${userId}) as liked,
        exists (select 1 from listing_saves where listing_id = ${listingId} and user_id = ${userId}) as saved
    `);
    return { listingId, likeCount: row.like_count, likedByMe: row.liked, savedByMe: row.saved };
  }

  private requireActive(status: string) {
    if (status !== 'active') {
      throw new BadRequestException({ code: 'LISTING_NOT_ACTIVE', message: 'Yayında olmayan ilana tepki verilemez' });
    }
  }

  // ---- Takip ----

  async follow(viewer: Viewer, agentId: string) {
    if (agentId === viewer.id) {
      throw new BadRequestException({ code: 'SELF_FOLLOW', message: 'Kendini takip edemezsin' });
    }
    await this.requireAgent(agentId);
    const inserted = await this.db
      .insert(follows)
      .values({ followerId: viewer.id, followeeId: agentId })
      .onConflictDoNothing()
      .returning({ followeeId: follows.followeeId });
    if (inserted.length > 0) {
      const [me] = await this.db.select({ fullName: users.fullName }).from(users).where(eq(users.id, viewer.id));
      await this.notifications.notify({
        userId: agentId,
        type: 'social.followed',
        title: 'Yeni takipçi',
        body: `${me?.fullName ?? 'Bir kullanıcı'} seni takip etmeye başladı`,
        data: { userId: viewer.id },
      });
    }
    return this.followState(viewer.id, agentId);
  }

  async unfollow(viewer: Viewer, agentId: string) {
    await this.db
      .delete(follows)
      .where(and(eq(follows.followerId, viewer.id), eq(follows.followeeId, agentId)));
    return this.followState(viewer.id, agentId);
  }

  private async followState(viewerId: string, agentId: string) {
    const {
      rows: [row],
    } = await this.db.execute<{ followers: number; following: boolean }>(sql`
      select
        (select count(*)::int from follows where followee_id = ${agentId}) as followers,
        exists (select 1 from follows where follower_id = ${viewerId} and followee_id = ${agentId}) as following
    `);
    return { agentId, followerCount: row.followers, followedByMe: row.following };
  }

  /** Takipçiler / takip edilenler: danışman kartları */
  async people(viewer: Viewer, agentId: string, kind: 'followers' | 'following', q: PageQuery) {
    await this.requireUser(agentId);
    const limit = q.limit ?? 30;
    const cursor = decodeCursor(q.cursor);
    const [selfCol, otherCol] =
      kind === 'followers' ? [follows.followeeId, follows.followerId] : [follows.followerId, follows.followeeId];
    const conds: SQL[] = [eq(selfCol, agentId), eq(users.status, 'active')];
    if (cursor) {
      conds.push(sql`(${follows.createdAt}, ${otherCol}) < (${cursor.at.toISOString()}::timestamptz, ${cursor.id}::uuid)`);
    }
    const rows = await this.db
      .select({ userId: otherCol, at: follows.createdAt })
      .from(follows)
      .innerJoin(users, eq(users.id, otherCol))
      .where(and(...conds))
      .orderBy(desc(follows.createdAt), desc(otherCol))
      .limit(limit + 1);
    const hasMore = rows.length > limit;
    const pageRows = rows.slice(0, limit);
    const cards = await this.personCards(viewer.id, pageRows.map((r) => r.userId));
    const last = pageRows.at(-1);
    return {
      items: pageRows.map((r) => cards.get(r.userId)!).filter(Boolean),
      nextCursor: hasMore && last ? encodeCursor(last.at, last.userId) : null,
    };
  }

  /**
   * Takip önerileri: onaylı, henüz takip edilmeyen danışmanlar.
   * Önce aynı ofis, sonra aynı il, sonra yayındaki ilan sayısı.
   */
  async suggestions(viewer: Viewer, limit = 10) {
    const [mine] = await this.db
      .select({ city: agentProfiles.city })
      .from(agentProfiles)
      .where(eq(agentProfiles.userId, viewer.id));
    const city = mine?.city ?? null;
    const { rows } = await this.db.execute<{ id: string }>(sql`
      select u.id
      from users u
      join agent_profiles p on p.user_id = u.id
      where u.status = 'active' and u.role = 'agent' and p.verification_status = 'approved'
        and u.id <> ${viewer.id}
        and not exists (select 1 from follows f where f.follower_id = ${viewer.id} and f.followee_id = u.id)
      order by
        exists (select 1 from office_memberships a
                join office_memberships b on b.office_id = a.office_id
                where a.user_id = ${viewer.id} and a.status = 'active'
                  and b.user_id = u.id and b.status = 'active') desc,
        (p.city is not distinct from ${city}) desc,
        (select count(*) from listings l where l.owner_id = u.id and l.status = 'active') desc,
        u.created_at desc
      limit ${limit}
    `);
    const ids = rows.map((r) => r.id);
    const cards = await this.personCards(viewer.id, ids);
    return ids.map((id) => cards.get(id)!).filter(Boolean);
  }

  /** Kişi listelerinde kullanılan sade kart */
  async personCards(viewerId: string, ids: string[]) {
    if (ids.length === 0) return new Map<string, PersonCard>();
    const rows = await this.db
      .select({
        id: users.id,
        fullName: users.fullName,
        role: users.role,
        verification: agentProfiles.verificationStatus,
        businessName: agentProfiles.businessName,
        city: agentProfiles.city,
        district: agentProfiles.district,
        officeName: sql<string | null>`(
          select o.name from office_memberships m join offices o on o.id = m.office_id
          where m.user_id = "users"."id" and m.status = 'active' and o.status = 'active' limit 1
        )`,
        followerCount: sql<number>`(select count(*)::int from follows f where f.followee_id = "users"."id")`,
        activeListingCount: sql<number>`(
          select count(*)::int from listings l where l.owner_id = "users"."id" and l.status = 'active'
        )`,
        followedByMe: sql<boolean>`exists (
          select 1 from follows f where f.follower_id = ${viewerId} and f.followee_id = "users"."id"
        )`,
      })
      .from(users)
      .leftJoin(agentProfiles, eq(agentProfiles.userId, users.id))
      .where(inArray(users.id, ids));
    return new Map(
      rows.map((r) => [
        r.id,
        {
          id: r.id,
          fullName: r.fullName,
          isAgent: r.role === 'agent',
          isVerified: r.verification === 'approved',
          businessName: r.businessName,
          city: r.city,
          district: r.district,
          officeName: r.officeName,
          followerCount: r.followerCount,
          activeListingCount: r.activeListingCount,
          followedByMe: r.followedByMe,
        } satisfies PersonCard,
      ]),
    );
  }

  // ---- Yardımcılar ----

  private page<T>(items: T[], limit: number, cursorOf: (x: T) => string) {
    const hasMore = items.length > limit;
    const pageItems = items.slice(0, limit);
    const last = pageItems.at(-1);
    return { items: pageItems, nextCursor: hasMore && last ? cursorOf(last) : null };
  }

  private async requireAgent(id: string) {
    const [row] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, id), eq(users.role, 'agent'), eq(users.status, 'active')))
      .limit(1);
    if (!row) throw new NotFoundException('Danışman bulunamadı');
  }

  private async requireUser(id: string) {
    const [row] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, id), eq(users.status, 'active')))
      .limit(1);
    if (!row) throw new NotFoundException('Kullanıcı bulunamadı');
  }
}

export interface PersonCard {
  id: string;
  fullName: string | null;
  isAgent: boolean;
  isVerified: boolean;
  businessName: string | null;
  city: string | null;
  district: string | null;
  officeName: string | null;
  followerCount: number;
  activeListingCount: number;
  followedByMe: boolean;
}
