import { avatarOf } from '../users/avatar.js';
import { and, eq, sql, type SQL } from 'drizzle-orm';
import type { Database } from '../db/db.module.js';
import {
  agentProfiles,
  cities,
  districts,
  listings,
  neighbourhoods,
  users,
  type UserRole,
} from '../db/schema.js';

export interface Viewer {
  id: string;
  role: UserRole | null;
}

/**
 * Bir ilanı kimin görebileceği (yalnızca aktif ilanlar için):
 *  - sahibi her zaman
 *  - public  → oturum açmış herkes (mülk sahipleri dahil)
 *  - agents  → danışmanlar
 *  - network → sahibini takip eden veya aynı ofisteki danışmanlar
 * Alt sorgular dış tabloya "listings" adıyla açıkça bağlanır.
 */
export function visibleTo(viewer: Viewer): SQL {
  const isAgent = viewer.role === 'agent';
  return sql`(
    "listings"."owner_id" = ${viewer.id}
    or "listings"."visibility" = 'public'
    or (${isAgent}::boolean and (
      "listings"."visibility" = 'agents'
      or ("listings"."visibility" = 'network' and (
        exists (select 1 from follows f
                where f.follower_id = ${viewer.id} and f.followee_id = "listings"."owner_id")
        or exists (select 1 from office_memberships a
                   join office_memberships b on b.office_id = a.office_id
                   where a.user_id = ${viewer.id} and a.status = 'active'
                     and b.user_id = "listings"."owner_id" and b.status = 'active')
      ))
    ))
  )`;
}

/** Yayındaki ve görüntüleyenin görebileceği ilanlar */
export function visibleActive(viewer: Viewer): SQL {
  return and(eq(listings.status, 'active'), visibleTo(viewer))!;
}

export const photoPath = (listingId: string, photoId: string) =>
  `/listings/${listingId}/photos/${photoId}`;

/** Akış, keşfet, arama ve portföy listelerinde kullanılan ortak kart */
export async function listingCards(
  db: Database,
  viewer: Viewer,
  opts: { where: SQL; orderBy: SQL[]; limit: number; offset?: number },
) {
  const rows = await db
    .select({
      id: listings.id,
      dealType: listings.dealType,
      category: listings.category,
      title: listings.title,
      price: listings.price,
      grossM2: listings.grossM2,
      netM2: listings.netM2,
      rooms: listings.rooms,
      cobrokeShare: listings.cobrokeShare,
      visibility: listings.visibility,
      status: listings.status,
      isDemo: listings.isDemo,
      eidsStatus: listings.eidsStatus,
      publishedAt: listings.publishedAt,
      createdAt: listings.createdAt,
      city: cities.name,
      district: districts.name,
      neighbourhood: neighbourhoods.name,
      ownerId: users.id,
      ownerName: users.fullName,
      ownerVerification: agentProfiles.verificationStatus,
      ownerBadge: agentProfiles.badge,
      ownerAvatarKey: users.avatarKey,
      ownerAvatarPreset: users.avatarPreset,
      ownerAvatarUpdatedAt: users.avatarUpdatedAt,
      ownerOffice: sql<string | null>`(
        select o.name from office_memberships m
        join offices o on o.id = m.office_id
        where m.user_id = "listings"."owner_id" and m.status = 'active' and o.status = 'active'
        limit 1
      )`,
      coverPhotoId: sql<string | null>`(
        select p.id from listing_photos p
        where p.listing_id = "listings"."id" order by p.position limit 1
      )`,
      photoCount: sql<number>`(
        select count(*)::int from listing_photos p where p.listing_id = "listings"."id"
      )`,
      likeCount: sql<number>`(
        select count(*)::int from listing_likes l where l.listing_id = "listings"."id"
      )`,
      likedByMe: sql<boolean>`exists (
        select 1 from listing_likes l where l.listing_id = "listings"."id" and l.user_id = ${viewer.id}
      )`,
      savedByMe: sql<boolean>`exists (
        select 1 from listing_saves s where s.listing_id = "listings"."id" and s.user_id = ${viewer.id}
      )`,
    })
    .from(listings)
    .innerJoin(users, eq(users.id, listings.ownerId))
    .leftJoin(agentProfiles, eq(agentProfiles.userId, users.id))
    .innerJoin(cities, eq(cities.code, listings.cityCode))
    .innerJoin(districts, eq(districts.id, listings.districtId))
    .leftJoin(neighbourhoods, eq(neighbourhoods.id, listings.neighbourhoodId))
    .where(opts.where)
    .orderBy(...opts.orderBy)
    .limit(opts.limit)
    .offset(opts.offset ?? 0);

  const isConsumer = viewer.role !== 'agent' && viewer.role !== 'admin';
  return rows.map((r) => ({
    id: r.id,
    dealType: r.dealType,
    category: r.category,
    title: r.title,
    price: r.price,
    grossM2: r.grossM2,
    netM2: r.netM2,
    rooms: r.rooms,
    // Mülk sahipleri komisyon paylaşım bilgisini görmez
    cobrokeShare: isConsumer ? null : r.cobrokeShare,
    visibility: r.visibility,
    status: r.status,
    isDemo: r.isDemo,
    eidsVerified: r.eidsStatus === 'verified',
    publishedAt: r.publishedAt,
    createdAt: r.createdAt,
    location: { city: r.city, district: r.district, neighbourhood: r.neighbourhood },
    owner: {
      id: r.ownerId,
      fullName: r.ownerName,
      isVerified: r.ownerVerification === 'approved',
      officeName: r.ownerOffice,
      badge: r.ownerVerification === 'approved' ? r.ownerBadge : null,
      avatar: avatarOf({ id: r.ownerId, avatarKey: r.ownerAvatarKey, avatarPreset: r.ownerAvatarPreset, avatarUpdatedAt: r.ownerAvatarUpdatedAt }),
    },
    coverPhoto: r.coverPhotoId ? photoPath(r.id, r.coverPhotoId) : null,
    photoCount: r.photoCount,
    likeCount: r.likeCount,
    likedByMe: r.likedByMe,
    savedByMe: r.savedByMe,
  }));
}

export type ListingCard = Awaited<ReturnType<typeof listingCards>>[number];
