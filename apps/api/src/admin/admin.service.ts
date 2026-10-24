import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, count, desc, eq, ne, sql } from 'drizzle-orm';
import { AgentsService } from '../agents/agents.service.js';
import { AuditService } from '../common/audit.service.js';
import { InjectDb, type Database } from '../db/db.module.js';
import {
  agentProfiles,
  users,
  verificationDocuments,
  type VerificationStatus,
} from '../db/schema.js';

@Injectable()
export class AdminService {
  constructor(
    @InjectDb() private readonly db: Database,
    private readonly agents: AgentsService,
    private readonly audit: AuditService,
  ) {}

  async list(status: VerificationStatus | 'all', limit: number, offset: number) {
    // "Tümü": başvuru yapılmış (taslak olmayan) tüm profiller
    const where = status === 'all' ? ne(agentProfiles.verificationStatus, 'draft') : eq(agentProfiles.verificationStatus, status);
    // Bekleyenler en eski başvurudan başlar (FIFO); diğerleri en yeniden.
    const order =
      status === 'pending'
        ? asc(agentProfiles.submittedAt)
        : desc(sql`coalesce(${agentProfiles.submittedAt}, ${agentProfiles.updatedAt})`);

    const items = await this.db
      .select({
        userId: users.id,
        fullName: users.fullName,
        phone: users.phone,
        businessName: agentProfiles.businessName,
        licenseNumber: agentProfiles.licenseNumber,
        city: agentProfiles.city,
        district: agentProfiles.district,
        status: agentProfiles.verificationStatus,
        submittedAt: agentProfiles.submittedAt,
        reviewedAt: agentProfiles.reviewedAt,
      })
      .from(agentProfiles)
      .innerJoin(users, eq(users.id, agentProfiles.userId))
      .where(where)
      .orderBy(order)
      .limit(limit)
      .offset(offset);

    const [{ total }] = await this.db
      .select({ total: count() })
      .from(agentProfiles)
      .where(where);

    return { items, total, limit, offset };
  }

  /** Panel sekmelerindeki sayılar için. */
  async counts() {
    const rows = await this.db
      .select({ status: agentProfiles.verificationStatus, total: count() })
      .from(agentProfiles)
      .groupBy(agentProfiles.verificationStatus);
    const result: Record<VerificationStatus, number> = {
      draft: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
    };
    for (const r of rows) result[r.status] = r.total;
    return result;
  }

  async detail(userId: string) {
    const [row] = await this.db
      .select({
        userId: users.id,
        fullName: users.fullName,
        phone: users.phone,
        email: users.email,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!row) throw new NotFoundException('Kullanıcı bulunamadı');
    return { user: row, ...(await this.agents.verification(userId)) };
  }

  async approve(adminId: string, userId: string) {
    const [updated] = await this.db
      .update(agentProfiles)
      .set({
        verificationStatus: 'approved',
        reviewedAt: new Date(),
        reviewedBy: adminId,
        rejectionReason: null,
      })
      .where(
        and(
          eq(agentProfiles.userId, userId),
          eq(agentProfiles.verificationStatus, 'pending'),
        ),
      )
      .returning({ userId: agentProfiles.userId });
    if (!updated) throw this.notPending();

    await this.audit.log({
      actorId: adminId,
      action: 'agent.approved',
      targetType: 'agent_profile',
      targetId: userId,
    });
    return this.detail(userId);
  }

  async reject(adminId: string, userId: string, reason: string) {
    const [updated] = await this.db
      .update(agentProfiles)
      .set({
        verificationStatus: 'rejected',
        reviewedAt: new Date(),
        reviewedBy: adminId,
        rejectionReason: reason.trim(),
      })
      .where(
        and(
          eq(agentProfiles.userId, userId),
          eq(agentProfiles.verificationStatus, 'pending'),
        ),
      )
      .returning({ userId: agentProfiles.userId });
    if (!updated) throw this.notPending();

    await this.audit.log({
      actorId: adminId,
      action: 'agent.rejected',
      targetType: 'agent_profile',
      targetId: userId,
      metadata: { reason: reason.trim() },
    });
    return this.detail(userId);
  }

  async streamDocument(documentId: string) {
    const [doc] = await this.db
      .select({ id: verificationDocuments.id })
      .from(verificationDocuments)
      .where(eq(verificationDocuments.id, documentId))
      .limit(1);
    if (!doc) throw new NotFoundException('Belge bulunamadı');
    return this.agents.streamDocument(documentId);
  }

  private notPending() {
    return new ConflictException({
      code: 'NOT_PENDING',
      message: 'Yalnızca incelemedeki başvurular onaylanabilir veya reddedilebilir',
    });
  }
}
