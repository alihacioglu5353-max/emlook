import { Injectable } from '@nestjs/common';
import { InjectDb, type Database } from '../db/db.module.js';
import { auditLogs } from '../db/schema.js';

export type AuditAction =
  | 'agent.submitted'
  | 'agent.approved'
  | 'agent.rejected'
  | 'user.onboarded'
  | 'consent.updated';

@Injectable()
export class AuditService {
  constructor(@InjectDb() private readonly db: Database) {}

  async log(entry: {
    actorId: string | null;
    action: AuditAction;
    targetType: string;
    targetId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.db.insert(auditLogs).values({
      actorId: entry.actorId,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId ?? null,
      metadata: entry.metadata ?? null,
    });
  }
}
