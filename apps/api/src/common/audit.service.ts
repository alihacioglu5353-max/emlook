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
  | 'password.reset';

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
    },
    tx: Pick<Database, 'insert'> = this.db,
  ): Promise<void> {
    await tx.insert(auditLogs).values({
      actorId: entry.actorId,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId ?? null,
      metadata: entry.metadata ?? null,
    });
  }
}
