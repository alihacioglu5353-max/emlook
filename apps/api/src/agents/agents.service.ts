import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { and, asc, count, eq, sql } from 'drizzle-orm';
import { AuditService } from '../common/audit.service.js';
import { InjectDb, type Database } from '../db/db.module.js';
import { activeOfficeOf } from '../db/queries.js';
import {
  agentProfiles,
  users,
  verificationDocuments,
  type AgentProfile,
  type DocumentType,
} from '../db/schema.js';
import { StorageService } from '../storage/storage.service.js';
import type { UpdateAgentProfileDto } from './dto.js';

const MAX_DOCUMENTS = 10;

/** Dosya türü uzantıya değil içeriğin ilk baytlarına göre belirlenir. */
function sniff(buffer: Buffer): { mime: string; ext: string } | null {
  if (buffer.subarray(0, 4).toString('latin1') === '%PDF') {
    return { mime: 'application/pdf', ext: 'pdf' };
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }
  if (
    buffer.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
  ) {
    return { mime: 'image/png', ext: 'png' };
  }
  return null;
}

const EDITABLE: AgentProfile['verificationStatus'][] = ['draft', 'rejected'];

@Injectable()
export class AgentsService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  async verification(userId: string) {
    const profile = await this.profileOrThrow(userId);
    const documents = await this.db
      .select({
        id: verificationDocuments.id,
        type: verificationDocuments.type,
        originalName: verificationDocuments.originalName,
        mimeType: verificationDocuments.mimeType,
        sizeBytes: verificationDocuments.sizeBytes,
        createdAt: verificationDocuments.createdAt,
      })
      .from(verificationDocuments)
      .where(eq(verificationDocuments.userId, userId))
      .orderBy(asc(verificationDocuments.createdAt));

    return {
      status: profile.verificationStatus,
      isVerified: profile.verificationStatus === 'approved',
      profile: {
        licenseNumber: profile.licenseNumber,
        businessName: profile.businessName,
        city: profile.city,
        district: profile.district,
        bio: profile.bio,
      },
      submittedAt: profile.submittedAt,
      reviewedAt: profile.reviewedAt,
      rejectionReason: profile.rejectionReason,
      documents,
      missing: this.missing(profile, documents.map((d) => d.type)),
    };
  }

  async updateProfile(userId: string, dto: UpdateAgentProfileDto) {
    const profile = await this.profileOrThrow(userId);
    this.assertEditable(profile);
    await this.db
      .update(agentProfiles)
      .set({
        ...(dto.licenseNumber !== undefined && {
          licenseNumber: dto.licenseNumber.trim(),
        }),
        ...(dto.businessName !== undefined && {
          businessName: dto.businessName.trim(),
        }),
        ...(dto.city !== undefined && { city: dto.city.trim() }),
        ...(dto.district !== undefined && { district: dto.district.trim() }),
        ...(dto.bio !== undefined && { bio: dto.bio.trim() }),
      })
      .where(eq(agentProfiles.userId, userId));
    return this.verification(userId);
  }

  async uploadDocument(
    userId: string,
    type: DocumentType,
    file: Express.Multer.File | undefined,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException({
        code: 'FILE_REQUIRED',
        message: 'Yüklenecek dosyayı seçin',
      });
    }
    const kind = sniff(file.buffer);
    if (!kind) {
      throw new BadRequestException({
        code: 'FILE_TYPE',
        message: 'Yalnızca PDF, JPG veya PNG yükleyebilirsiniz',
      });
    }

    const profile = await this.profileOrThrow(userId);
    this.assertEditable(profile);

    const [{ value: existing }] = await this.db
      .select({ value: count() })
      .from(verificationDocuments)
      .where(eq(verificationDocuments.userId, userId));
    if (existing >= MAX_DOCUMENTS) {
      throw new BadRequestException({
        code: 'TOO_MANY_FILES',
        message: `En fazla ${MAX_DOCUMENTS} belge yükleyebilirsiniz`,
      });
    }

    const key = await this.storage.put(`verification/${userId}`, file.buffer, kind.ext, kind.mime);
    try {
      const [doc] = await this.db
        .insert(verificationDocuments)
        .values({
          userId,
          type,
          storageKey: key,
          originalName: (file.originalname || `belge.${kind.ext}`).slice(0, 200),
          mimeType: kind.mime,
          sizeBytes: file.size,
        })
        .returning({ id: verificationDocuments.id });
      return { id: doc.id, ...(await this.verification(userId)) };
    } catch (err) {
      await this.storage.remove(key);
      throw err;
    }
  }

  async deleteDocument(userId: string, documentId: string) {
    const profile = await this.profileOrThrow(userId);
    this.assertEditable(profile);
    const [doc] = await this.db
      .delete(verificationDocuments)
      .where(
        and(
          eq(verificationDocuments.id, documentId),
          eq(verificationDocuments.userId, userId),
        ),
      )
      .returning({ storageKey: verificationDocuments.storageKey });
    if (!doc) throw new NotFoundException('Belge bulunamadı');
    await this.storage.remove(doc.storageKey);
    return this.verification(userId);
  }

  async submit(userId: string) {
    const current = await this.verification(userId);
    if (current.status === 'pending') {
      throw new ConflictException({
        code: 'ALREADY_PENDING',
        message: 'Başvurunuz zaten incelemede',
      });
    }
    if (current.status === 'approved') {
      throw new ConflictException({
        code: 'ALREADY_APPROVED',
        message: 'Hesabınız zaten onaylı',
      });
    }
    if (current.missing.length > 0) {
      throw new BadRequestException({
        code: 'PROFILE_INCOMPLETE',
        message: 'Başvuru için eksik bilgiler var',
        missing: current.missing,
      });
    }

    await this.db
      .update(agentProfiles)
      .set({
        verificationStatus: 'pending',
        submittedAt: new Date(),
        rejectionReason: null,
      })
      .where(eq(agentProfiles.userId, userId));

    await this.audit.log({
      actorId: userId,
      action: 'agent.submitted',
      targetType: 'agent_profile',
      targetId: userId,
    });
    return this.verification(userId);
  }

  /** Diğer kullanıcıların görebileceği danışman kartı. */
  async publicCard(agentId: string, viewerId?: string) {
    const [row] = await this.db
      .select({
        id: users.id,
        fullName: users.fullName,
        businessName: agentProfiles.businessName,
        city: agentProfiles.city,
        district: agentProfiles.district,
        bio: agentProfiles.bio,
        verificationStatus: agentProfiles.verificationStatus,
        followerCount: sql<number>`(select count(*)::int from follows f where f.followee_id = "users"."id")`,
        followingCount: sql<number>`(select count(*)::int from follows f where f.follower_id = "users"."id")`,
        activeListingCount: sql<number>`(
          select count(*)::int from listings l where l.owner_id = "users"."id" and l.status = 'active'
        )`,
        followedByMe: viewerId
          ? sql<boolean>`exists (select 1 from follows f where f.follower_id = ${viewerId} and f.followee_id = "users"."id")`
          : sql<boolean>`false`,
      })
      .from(users)
      .innerJoin(agentProfiles, eq(agentProfiles.userId, users.id))
      .where(and(eq(users.id, agentId), eq(users.status, 'active')))
      .limit(1);
    if (!row) throw new NotFoundException('Danışman bulunamadı');
    const { verificationStatus, ...card } = row;
    const office = await activeOfficeOf(this.db, agentId);
    // Yalnızca onaylı ofis gösterilir; yoksa "Bağımsız Danışman"
    const visible = office?.status === 'active' ? office : null;
    return {
      ...card,
      isVerified: verificationStatus === 'approved',
      office: visible && { id: visible.id, name: visible.name, role: visible.role },
      independent: !visible,
    };
  }

  /** Belge dosyasını akıtır. Sahiplik/rol kontrolü çağıran tarafta yapılır. */
  async streamDocument(documentId: string, ownerId?: string) {
    const where = ownerId
      ? and(
          eq(verificationDocuments.id, documentId),
          eq(verificationDocuments.userId, ownerId),
        )
      : eq(verificationDocuments.id, documentId);
    const [doc] = await this.db
      .select()
      .from(verificationDocuments)
      .where(where)
      .limit(1);
    if (!doc) throw new NotFoundException('Belge bulunamadı');
    return new StreamableFile(await this.storage.stream(doc.storageKey), {
      type: doc.mimeType,
      length: doc.sizeBytes,
      disposition: `inline; filename*=UTF-8''${encodeURIComponent(doc.originalName)}`,
    });
  }

  private missing(profile: AgentProfile, docTypes: DocumentType[]): string[] {
    const missing: string[] = [];
    if (!profile.licenseNumber) missing.push('licenseNumber');
    if (!profile.businessName) missing.push('businessName');
    if (!profile.city) missing.push('city');
    if (!profile.district) missing.push('district');
    if (!docTypes.includes('authority_certificate')) {
      missing.push('document:authority_certificate');
    }
    return missing;
  }

  private async profileOrThrow(userId: string): Promise<AgentProfile> {
    const [profile] = await this.db
      .select()
      .from(agentProfiles)
      .where(eq(agentProfiles.userId, userId))
      .limit(1);
    if (!profile) {
      throw new NotFoundException({
        code: 'NOT_AGENT',
        message: 'Danışman profili bulunamadı',
      });
    }
    return profile;
  }

  private assertEditable(profile: AgentProfile) {
    if (!EDITABLE.includes(profile.verificationStatus)) {
      throw new ConflictException({
        code: 'PROFILE_LOCKED',
        message:
          profile.verificationStatus === 'pending'
            ? 'Başvurunuz incelemedeyken değişiklik yapılamaz'
            : 'Onaylı profil bilgileri destek ekibi aracılığıyla değiştirilebilir',
      });
    }
  }
}
