/**
 * Türkiye cep telefonu numaralarını E.164 biçimine (+905XXXXXXXXX) çevirir.
 * Kabul edilen girişler: "0532 123 45 67", "5321234567", "905321234567",
 * "+90 (532) 123-45-67". Geçersizse null döner.
 */
export function normalizeTrPhone(input: string): string | null {
  if (typeof input !== 'string') return null;
  const digits = input.replace(/[\s()\-.]/g, '').replace(/^\+/, '');
  if (!/^\d+$/.test(digits)) return null;

  let national: string;
  if (digits.length === 12 && digits.startsWith('90')) {
    national = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith('0')) {
    national = digits.slice(1);
  } else if (digits.length === 10) {
    national = digits;
  } else {
    return null;
  }
  // Türkiye'de cep numaraları 5 ile başlar.
  if (!/^5\d{9}$/.test(national)) return null;
  return `+90${national}`;
}

/** Loglar ve SMS dışı çıktılar için: +90532*****67 */
export function maskPhone(e164: string): string {
  if (e164.length < 7) return '***';
  return `${e164.slice(0, 6)}*****${e164.slice(-2)}`;
}
