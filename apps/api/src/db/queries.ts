import { and, eq } from 'drizzle-orm';
import type { Database } from './db.module.js';
import { officeMemberships, offices, type OfficeRole, type OfficeStatus } from './schema.js';

export interface OfficeSummary {
  id: string;
  name: string;
  role: OfficeRole;
  status: OfficeStatus;
}

/** Danışmanın aktif ofis üyeliği (yoksa null → Bağımsız Danışman). */
export async function activeOfficeOf(db: Database, userId: string): Promise<OfficeSummary | null> {
  const [row] = await db
    .select({
      id: offices.id,
      name: offices.name,
      role: officeMemberships.role,
      status: offices.status,
    })
    .from(officeMemberships)
    .innerJoin(offices, eq(offices.id, officeMemberships.officeId))
    .where(and(eq(officeMemberships.userId, userId), eq(officeMemberships.status, 'active')))
    .limit(1);
  return row ?? null;
}
