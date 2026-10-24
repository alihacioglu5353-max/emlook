const FOLD: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };

/**
 * Arama için metni sadeleştirir: Türkçe küçük harf, aksansız, tek boşluk.
 * "İSTANBUL Kadıköy" → "istanbul kadikoy"
 */
export function normalizeForSearch(input: string): string {
  return input
    .toLocaleLowerCase('tr')
    .replace(/[çğıöşüâîû]/g, (c) => FOLD[c] ?? c)
    .replace(/[^a-z0-9+\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
