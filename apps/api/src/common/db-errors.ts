/** Postgres benzersizlik ihlali (aynı anda iki istek). Drizzle hatayı `cause` içine sarar. */
export function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: string; cause?: { code?: string } } | null;
  return err?.code === '23505' || err?.cause?.code === '23505';
}
