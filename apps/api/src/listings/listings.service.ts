import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, asc, count, desc, eq, sql } from 'drizzle-orm';
import { normalizeForSearch } from '../common/text.js';
import type { Env } from '../config/env.js';
import { InjectDb, type Database } from '../db/db.module.js';
import { activeOfficeOf } from '../db/queries.js';
import {
  agentProfiles,
  cities,
  districts,
  listingPhotos,
  listings,
  neighbourhoods,
  users,
  type Listing,
  type ListingStatus,
} from '../db/schema.js';
import { EidsProvider } from '../eids/eids.service.js';
import { StorageService } from '../storage/storage.service.js';
import type { CreateListingDto, MyListingsQuery, UpdateListingDto } from './dto.js';
import { listingCards, photoPath, visibleTo, type Viewer } from './listing-cards.js';

export const CATEGORY_LABEL: Record<Listing['category'], string> = {
  apartment: 'Daire',
  residence: 'Rezidans',
  villa: 'Villa',
  detached_house: 'Müstakil ev',
  land: 'Arsa',
  shop: 'Dükkân & Mağaza',
  office: 'Ofis & Büro',
  warehouse: 'Depo',
  building: 'Komple bina',
  other: 'Diğer',
};

const DEAL_LABEL = { sale: 'satılık', rent: 'kiralık' } as const;

/** Görsel türü içerik imzasından belirlenir. */
function sniffImage(b: Buffer): { mime: string; ext: string } | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mime: 'image/png', ext: 'png' };
  }
  if (b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') {
    return { mime: 'image/webp', ext: 'webp' };
  }
  return null;
}

const EDITABLE: ListingStatus[] = ['draft', 'active', 'passive'];

@Injectable()
export class ListingsService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly storage: StorageService,
    private readonly eids: EidsProvider,
    private readonly config: ConfigService<Env, true>,
  ) {}

  // ---- Oluşturma ve düzenleme ----

  async create(userId: string, dto: CreateListingDto) {
    await this.requireApprovedAgent(userId);
    const loc = await this.resolveLocation(dto.cityCode, dto.districtId, dto.neighbourhoodId);
    const office = await activeOfficeOf(this.db, userId);

    const [row] = await this.db
      .insert(listings)
      .values({
        ownerId: userId,
        officeId: office?.status === 'active' ? office.id : null,
        dealType: dto.dealType,
        category: dto.category,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        price: dto.price,
        grossM2: dto.grossM2 ?? null,
        netM2: dto.netM2 ?? null,
        rooms: dto.rooms ?? null,
        floor: dto.floor?.trim() || null,
        buildingAge: dto.buildingAge ?? null,
        cityCode: dto.cityCode,
        districtId: dto.districtId,
        neighbourhoodId: dto.neighbourhoodId ?? null,
        cobrokeShare: dto.cobrokeShare,
        visibility: dto.visibility ?? 'public',
        isDemo: dto.isDemo ?? false,
        propertyNumber: dto.propertyNumber ?? null,
        searchText: this.searchText(dto, loc),
      })
      .returning({ id: listings.id });
    return this.detail(row.id, { id: userId, role: 'agent' });
  }

  async update(userId: string, id: string, dto: UpdateListingDto) {
    const current = await this.ownListing(userId, id);
    if (!EDITABLE.includes(current.status)) {
      throw new ConflictException({ code: 'LISTING_LOCKED', message: 'Bu ilan artık düzenlenemez' });
    }
    if (
      dto.propertyNumber !== undefined &&
      dto.propertyNumber !== current.propertyNumber &&
      current.eidsStatus === 'verified'
    ) {
      throw new ConflictException({
        code: 'EIDS_LOCKED',
        message: 'EİDS ile doğrulanmış taşınmaz numarası değiştirilemez; yeni ilan oluşturun',
      });
    }

    const changes: Partial<CreateListingDto> = Object.fromEntries(
      Object.entries(dto).filter(([, v]) => v !== undefined),
    );
    const merged = Object.assign({}, current, changes) as Listing & CreateListingDto;
    // İlçe değiştiyse ve yeni mahalle gönderilmediyse eski mahalle geçersizdir
    const districtChanged = dto.districtId !== undefined && dto.districtId !== current.districtId;
    const neighbourhoodId =
      dto.neighbourhoodId !== undefined ? dto.neighbourhoodId : districtChanged ? undefined : current.neighbourhoodId;
    const loc = await this.resolveLocation(merged.cityCode, merged.districtId, neighbourhoodId ?? undefined);

    const patch: Partial<typeof listings.$inferInsert> = {};
    const assign = <K extends keyof CreateListingDto>(k: K, v: unknown) => {
      if (dto[k] !== undefined) (patch as Record<string, unknown>)[k] = v;
    };
    assign('dealType', dto.dealType);
    assign('category', dto.category);
    assign('title', dto.title?.trim());
    assign('description', dto.description?.trim() || null);
    assign('price', dto.price);
    assign('grossM2', dto.grossM2);
    assign('netM2', dto.netM2);
    assign('rooms', dto.rooms);
    assign('floor', dto.floor?.trim() || null);
    assign('buildingAge', dto.buildingAge);
    assign('cityCode', dto.cityCode);
    assign('districtId', dto.districtId);
    assign('neighbourhoodId', dto.neighbourhoodId);
    assign('cobrokeShare', dto.cobrokeShare);
    assign('visibility', dto.visibility);
    assign('isDemo', dto.isDemo);
    if (dto.propertyNumber !== undefined && dto.propertyNumber !== current.propertyNumber) {
      patch.propertyNumber = dto.propertyNumber;
      patch.eidsStatus = 'unverified';
      patch.eidsReference = null;
      patch.eidsMessage = null;
      patch.eidsCheckedAt = null;
    }
    // Kişi ilçe değiştirip mahalleyi göndermediyse eski mahalle geçersiz olur
    if (dto.districtId !== undefined && dto.neighbourhoodId === undefined && dto.districtId !== current.districtId) {
      patch.neighbourhoodId = null;
    }
    patch.searchText = this.searchText(merged, loc);

    // EİDS onayı gerektiren bir alan değiştiyse ve ilan artık yayın şartını karşılamıyorsa taslağa düşer
    const willBeDemo = patch.isDemo ?? current.isDemo;
    const willBeVerified = (patch.eidsStatus ?? current.eidsStatus) === 'verified';
    if (current.status === 'active' && !willBeDemo && !willBeVerified) patch.status = 'draft';

    await this.db.update(listings).set(patch).where(eq(listings.id, id));
    return this.detail(id, { id: userId, role: 'agent' });
  }

  async remove(userId: string, id: string) {
    const current = await this.ownListing(userId, id);
    if (current.status !== 'draft') {
      throw new ConflictException({
        code: 'NOT_DRAFT',
        message: 'Yalnızca taslak ilanlar silinebilir; yayındaki ilanı pasife alın',
      });
    }
    const photos = await this.db
      .select({ key: listingPhotos.storageKey })
      .from(listingPhotos)
      .where(eq(listingPhotos.listingId, id));
    await this.db.delete(listings).where(eq(listings.id, id));
    await Promise.all(photos.map((p) => this.storage.remove(p.key)));
  }

  // ---- Fotoğraflar ----

  async addPhoto(userId: string, id: string, file: Express.Multer.File | undefined) {
    const current = await this.ownListing(userId, id);
    if (!EDITABLE.includes(current.status)) {
      throw new ConflictException({ code: 'LISTING_LOCKED', message: 'Bu ilana fotoğraf eklenemez' });
    }
    if (!file?.buffer?.length) {
      throw new BadRequestException({ code: 'FILE_REQUIRED', message: 'Fotoğraf seçin' });
    }
    const kind = sniffImage(file.buffer);
    if (!kind) {
      throw new BadRequestException({ code: 'FILE_TYPE', message: 'Yalnızca JPG, PNG veya WebP yükleyebilirsiniz' });
    }
    const max = this.config.get('MAX_LISTING_PHOTOS', { infer: true });
    const [{ n }] = await this.db
      .select({ n: count() })
      .from(listingPhotos)
      .where(eq(listingPhotos.listingId, id));
    if (n >= max) {
      throw new BadRequestException({ code: 'TOO_MANY_PHOTOS', message: `En fazla ${max} fotoğraf eklenebilir` });
    }
    const key = await this.storage.put(`listings/${id}`, file.buffer, kind.ext);
    try {
      await this.db.insert(listingPhotos).values({
        listingId: id,
        storageKey: key,
        mimeType: kind.mime,
        sizeBytes: file.size,
        position: n,
      });
    } catch (e) {
      await this.storage.remove(key);
      throw e;
    }
    return this.detail(id, { id: userId, role: 'agent' });
  }

  async removePhoto(userId: string, id: string, photoId: string) {
    await this.ownListing(userId, id);
    const [photo] = await this.db
      .delete(listingPhotos)
      .where(and(eq(listingPhotos.id, photoId), eq(listingPhotos.listingId, id)))
      .returning();
    if (!photo) throw new NotFoundException('Fotoğraf bulunamadı');
    await this.storage.remove(photo.storageKey);
    await this.compactPositions(id);
    return this.detail(id, { id: userId, role: 'agent' });
  }

  async reorderPhotos(userId: string, id: string, ids: string[]) {
    await this.ownListing(userId, id);
    const existing = await this.db
      .select({ id: listingPhotos.id })
      .from(listingPhotos)
      .where(eq(listingPhotos.listingId, id));
    const set = new Set(existing.map((p) => p.id));
    if (ids.length !== set.size || !ids.every((x) => set.has(x)) || new Set(ids).size !== ids.length) {
      throw new BadRequestException({ code: 'ORDER_MISMATCH', message: 'Sıralama tüm fotoğrafları bir kez içermeli' });
    }
    await this.db.transaction(async (tx) => {
      for (const [i, photoId] of ids.entries()) {
        await tx.update(listingPhotos).set({ position: i }).where(eq(listingPhotos.id, photoId));
      }
    });
    return this.detail(id, { id: userId, role: 'agent' });
  }

  async streamPhoto(viewer: Viewer, id: string, photoId: string) {
    await this.assertCanView(viewer, id);
    const [photo] = await this.db
      .select()
      .from(listingPhotos)
      .where(and(eq(listingPhotos.id, photoId), eq(listingPhotos.listingId, id)))
      .limit(1);
    if (!photo) throw new NotFoundException('Fotoğraf bulunamadı');
    return new StreamableFile(this.storage.stream(photo.storageKey), {
      type: photo.mimeType,
      length: photo.sizeBytes,
    });
  }

  // ---- EİDS ve yayın ----

  async verifyEids(userId: string, id: string) {
    const current = await this.ownListing(userId, id);
    if (!current.propertyNumber) {
      throw new BadRequestException({ code: 'PROPERTY_NUMBER_REQUIRED', message: 'Önce taşınmaz numarasını girin' });
    }
    if (current.eidsStatus === 'verified') return this.detail(id, { id: userId, role: 'agent' });

    const [profile] = await this.db
      .select({ licenseNumber: agentProfiles.licenseNumber })
      .from(agentProfiles)
      .where(eq(agentProfiles.userId, userId));
    const result = await this.eids.check({
      propertyNumber: current.propertyNumber,
      licenseNumber: profile?.licenseNumber ?? '',
    });
    await this.db
      .update(listings)
      .set({
        eidsStatus: result.status,
        eidsReference: result.reference ?? null,
        eidsMessage: result.message,
        eidsCheckedAt: new Date(),
      })
      .where(eq(listings.id, id));
    return this.detail(id, { id: userId, role: 'agent' });
  }

  /**
   * Yayına alır. Şartlar: en az bir fotoğraf ve EİDS onayı (ya da açıkça
   * "deneme ilanı" olarak işaretlenmiş olması).
   */
  async publish(userId: string, id: string) {
    await this.requireApprovedAgent(userId);
    const current = await this.ownListing(userId, id);
    if (current.status === 'active') return this.detail(id, { id: userId, role: 'agent' });
    if (current.status !== 'draft' && current.status !== 'passive') {
      throw new ConflictException({ code: 'LISTING_LOCKED', message: 'Bu ilan yayına alınamaz' });
    }
    const missing: string[] = [];
    const [{ n }] = await this.db.select({ n: count() }).from(listingPhotos).where(eq(listingPhotos.listingId, id));
    if (n === 0) missing.push('photo');
    if (!current.isDemo && current.eidsStatus !== 'verified') missing.push('eids');
    if (missing.length > 0) {
      throw new BadRequestException({
        code: 'NOT_PUBLISHABLE',
        message:
          missing.includes('eids')
            ? 'Yayın için EİDS yetki doğrulaması gerekiyor'
            : 'Yayın için en az bir fotoğraf ekleyin',
        missing,
      });
    }
    await this.db
      .update(listings)
      .set({ status: 'active', publishedAt: current.publishedAt ?? new Date() })
      .where(eq(listings.id, id));
    return this.detail(id, { id: userId, role: 'agent' });
  }

  async setStatus(userId: string, id: string, status: 'passive' | 'sold') {
    const current = await this.ownListing(userId, id);
    const allowed = status === 'passive' ? ['active'] : ['active', 'passive'];
    if (!allowed.includes(current.status)) {
      throw new ConflictException({ code: 'INVALID_STATUS', message: 'Bu ilanın durumu değiştirilemez' });
    }
    await this.db.update(listings).set({ status }).where(eq(listings.id, id));
    return this.detail(id, { id: userId, role: 'agent' });
  }

  // ---- Okuma ----

  async mine(userId: string, q: MyListingsQuery) {
    const conds = [eq(listings.ownerId, userId)];
    if (q.status) conds.push(eq(listings.status, q.status));
    if (q.dealType) conds.push(eq(listings.dealType, q.dealType));
    const items = await listingCards(
      this.db,
      { id: userId, role: 'agent' },
      { where: and(...conds)!, orderBy: [desc(listings.updatedAt)], limit: q.limit ?? 30, offset: q.offset ?? 0 },
    );
    const countRows = await this.db
      .select({ status: listings.status, dealType: listings.dealType, n: count() })
      .from(listings)
      .where(eq(listings.ownerId, userId))
      .groupBy(listings.status, listings.dealType);
    const counts = { draft: 0, active: 0, passive: 0, sold: 0, removed: 0, sale: 0, rent: 0 };
    for (const r of countRows) {
      counts[r.status] += r.n;
      if (r.status !== 'removed') counts[r.dealType] += r.n;
    }
    return { items, counts };
  }

  async detail(id: string, viewer: Viewer) {
    const listing = await this.assertCanView(viewer, id);
    const [loc] = await this.db
      .select({ city: cities.name, district: districts.name, neighbourhood: neighbourhoods.name })
      .from(listings)
      .innerJoin(cities, eq(cities.code, listings.cityCode))
      .innerJoin(districts, eq(districts.id, listings.districtId))
      .leftJoin(neighbourhoods, eq(neighbourhoods.id, listings.neighbourhoodId))
      .where(eq(listings.id, id));
    const photos = await this.db
      .select({ id: listingPhotos.id, position: listingPhotos.position })
      .from(listingPhotos)
      .where(eq(listingPhotos.listingId, id))
      .orderBy(asc(listingPhotos.position));
    const [owner] = await this.db
      .select({ id: users.id, fullName: users.fullName, verification: agentProfiles.verificationStatus })
      .from(users)
      .leftJoin(agentProfiles, eq(agentProfiles.userId, users.id))
      .where(eq(users.id, listing.ownerId));
    const office = await activeOfficeOf(this.db, listing.ownerId);
    const [card] = await listingCards(this.db, viewer, {
      where: eq(listings.id, id),
      orderBy: [],
      limit: 1,
    });

    const isOwner = viewer.id === listing.ownerId;
    const isConsumer = viewer.role !== 'agent' && viewer.role !== 'admin';
    return {
      id: listing.id,
      dealType: listing.dealType,
      category: listing.category,
      categoryLabel: CATEGORY_LABEL[listing.category],
      title: listing.title,
      description: listing.description,
      price: listing.price,
      grossM2: listing.grossM2,
      netM2: listing.netM2,
      rooms: listing.rooms,
      floor: listing.floor,
      buildingAge: listing.buildingAge,
      cityCode: listing.cityCode,
      districtId: listing.districtId,
      neighbourhoodId: listing.neighbourhoodId,
      location: loc,
      cobrokeShare: isConsumer ? null : listing.cobrokeShare,
      visibility: listing.visibility,
      status: listing.status,
      isDemo: listing.isDemo,
      publishedAt: listing.publishedAt,
      updatedAt: listing.updatedAt,
      eids: {
        verified: listing.eidsStatus === 'verified',
        // Ayrıntılar yalnızca ilan sahibine
        ...(isOwner && {
          status: listing.eidsStatus,
          propertyNumber: listing.propertyNumber,
          message: listing.eidsMessage,
          checkedAt: listing.eidsCheckedAt,
        }),
      },
      photos: photos.map((p) => ({ id: p.id, url: photoPath(id, p.id) })),
      owner: {
        id: owner.id,
        fullName: owner.fullName,
        isVerified: owner.verification === 'approved',
        office: office?.status === 'active' ? { id: office.id, name: office.name } : null,
      },
      likeCount: card?.likeCount ?? 0,
      likedByMe: card?.likedByMe ?? false,
      savedByMe: card?.savedByMe ?? false,
      isOwner,
      removedReason: isOwner ? listing.removedReason : undefined,
    };
  }

  // ---- Yardımcılar ----

  /** İlanı görme yetkisi: sahibi, yönetici veya görünürlük kuralı */
  async assertCanView(viewer: Viewer, id: string): Promise<Listing> {
    const [row] = await this.db.select().from(listings).where(eq(listings.id, id)).limit(1);
    if (!row) throw new NotFoundException('İlan bulunamadı');
    if (row.ownerId === viewer.id || viewer.role === 'admin') return row;
    if (row.status !== 'active') throw new NotFoundException('İlan bulunamadı');
    const [visible] = await this.db
      .select({ id: listings.id })
      .from(listings)
      .where(and(eq(listings.id, id), visibleTo(viewer)));
    if (!visible) throw new NotFoundException('İlan bulunamadı');
    return row;
  }

  private async ownListing(userId: string, id: string): Promise<Listing> {
    const [row] = await this.db.select().from(listings).where(eq(listings.id, id)).limit(1);
    if (!row || row.ownerId !== userId) throw new NotFoundException('İlan bulunamadı');
    if (row.status === 'removed') {
      throw new ConflictException({
        code: 'LISTING_REMOVED',
        message: `Bu ilan yönetici tarafından yayından kaldırıldı${row.removedReason ? `: ${row.removedReason}` : ''}`,
      });
    }
    return row;
  }

  private async requireApprovedAgent(userId: string) {
    const [row] = await this.db
      .select({ role: users.role, status: agentProfiles.verificationStatus })
      .from(users)
      .leftJoin(agentProfiles, eq(agentProfiles.userId, users.id))
      .where(eq(users.id, userId));
    if (row?.role !== 'agent' || row.status !== 'approved') {
      throw new ForbiddenException({ code: 'NOT_VERIFIED', message: 'Portföy eklemek için onaylı danışman olmanız gerekiyor' });
    }
  }

  private async resolveLocation(cityCode: string, districtId: number, neighbourhoodId?: number | null) {
    const [d] = await this.db
      .select({ city: cities.name, district: districts.name })
      .from(districts)
      .innerJoin(cities, eq(cities.code, districts.cityCode))
      .where(and(eq(districts.id, districtId), eq(districts.cityCode, cityCode)));
    if (!d) throw new BadRequestException({ code: 'LOCATION_INVALID', message: 'İlçe seçilen ile ait değil' });
    let neighbourhood: string | null = null;
    if (neighbourhoodId) {
      const [n] = await this.db
        .select({ name: neighbourhoods.name })
        .from(neighbourhoods)
        .where(and(eq(neighbourhoods.id, neighbourhoodId), eq(neighbourhoods.districtId, districtId)));
      if (!n) throw new BadRequestException({ code: 'LOCATION_INVALID', message: 'Mahalle seçilen ilçeye ait değil' });
      neighbourhood = n.name;
    }
    return { ...d, neighbourhood };
  }

  private searchText(
    l: Pick<CreateListingDto, 'title' | 'dealType' | 'category'> & {
      rooms?: string | null;
      description?: string | null;
    },
    loc: { city: string; district: string; neighbourhood: string | null },
  ) {
    return normalizeForSearch(
      [
        l.title,
        DEAL_LABEL[l.dealType],
        CATEGORY_LABEL[l.category],
        l.rooms ?? '',
        loc.city,
        loc.district,
        loc.neighbourhood ?? '',
        // Açıklamanın başı da aranır ("deniz manzaralı", "otoparklı")
        (l.description ?? '').slice(0, 1000),
      ].join(' '),
    );
  }

  private async compactPositions(id: string) {
    await this.db.execute(sql`
      update listing_photos p set position = r.rn - 1
      from (select id, row_number() over (order by position) rn from listing_photos where listing_id = ${id}) r
      where p.id = r.id
    `);
  }
}
