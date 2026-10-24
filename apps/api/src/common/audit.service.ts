import { Injectable } from '@nestjs/common';
import { InjectDb, type Database } from '../db/db.module.js';
import { auditLogs } from '../db/schema.js';

export type AuditAction =
  | 'agent.submitted'
  | 'agent.approved'
  | 'agent.rejected'
  | 'user.onboarded'
  | 'consent.updated'
  | 'office.approved'
  | 'office.rejected'
  | 'office.member_joined'
  | 'office.member_transferred'
  | 'payout_account.updated'
  | 'payment_request.created'
  | 'payment_request.cancelled'
  | 'user.suspended'
  | 'user.reactivated'
  | 'listing.removed'
  | 'listing.restored'
  | 'listing.eids_verified'
  | 'listing.eids_failed'
  | 'report.dismissed'
  | 'auth.locked'
  | 'password.set'
  | 'password.changed'
  | 'password.reset_requested'
  | 'password.reset'
  | 'auth.login'
  | 'auth.login_failed'
  | 'auth.logout'
  | 'listing.created'
  | 'listing.published'
  | 'listing.status_changed'
  | 'listing.deleted'
  | 'interest.created'
  | 'payment.paid'
  | 'settings.updated'
  | 'document_type.updated'
  | 'badges.recomputed'
  | 'session.revoked';

@Injectable()
export class AuditService {
  constructor(@InjectDb() private readonly db: Database) {}

  /** `tx` verilirse kayıt çağıranın transaction'ı içinde yazılır. */
  async log(
    entry: {
      actorId: string | null;
      action: AuditAction;
      targetType: string;
      targetId?: string;
      metadata?: Record<string, unknown>;
      ip?: string | null;
      userAgent?: string | null;
    },
    tx: Pick<Database, 'insert'> = this.db,
  ): Promise<void> {
    await tx.insert(auditLogs).values({
      actorId: entry.actorId,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId ?? null,
      metadata: entry.metadata ?? null,
      ip: entry.ip ?? null,
      userAgent: entry.userAgent?.slice(0, 400) ?? null,
    });
  }
}
