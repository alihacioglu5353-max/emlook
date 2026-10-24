/** Drizzle, Postgres hatasını `cause` içine sarar */
function pgCode(e: unknown): string | undefined {
  const err = e as { code?: string; cause?: { code?: string } } | null;
  return err?.cause?.code ?? err?.code;
}

/** Postgres benzersizlik ihlali (aynı anda iki istek). */
export function isUniqueViolation(e: unknown): boolean {
  return pgCode(e) === '23505';
}

/**
 * Eşzamanlı değişiklik çakışması: benzersizlik ihlali, kilitlenme (40P01) veya
 * serileştirme hatası (40001). İstemci yenileyip tekrar deneyebilir.
 */
export function isConcurrencyConflict(e: unknown): boolean {
  const code = pgCode(e);
  return code === '23505' || code === '40P01' || code === '40001';
}
