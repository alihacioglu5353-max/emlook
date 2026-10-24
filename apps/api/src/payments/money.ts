/** Para hesapları kuruş (tam sayı) üzerinden yapılır. */

export interface Split {
  platform: number;
  seller: number;
  buyer: number;
}

/**
 * Komisyonu böler: önce platform hizmet bedeli (on binde), kalan danışmanlar
 * arasında alıcı danışman payına (%) göre. Yuvarlama artığı ilan danışmanında kalır.
 */
export function splitAmount(amount: number, platformFeeBps: number, buyerSharePct: number): Split {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Tutar pozitif tam sayı (kuruş) olmalı');
  const platform = Math.round((amount * platformFeeBps) / 10_000);
  const rest = amount - platform;
  const buyer = Math.floor((rest * buyerSharePct) / 100);
  return { platform, seller: rest - buyer, buyer };
}

/** KDV dahil tutardan net ve KDV */
export function vatFromGross(gross: number, vatRateBps: number) {
  const net = Math.round((gross * 10_000) / (10_000 + vatRateBps));
  return { net, vat: gross - net, total: gross };
}

/** TR IBAN: TR + 24 hane, mod 97 = 1 */
export function normalizeIban(input: string): string | null {
  const iban = input.replace(/\s+/g, '').toUpperCase();
  if (!/^TR\d{24}$/.test(iban)) return null;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rem = 0;
  for (const ch of numeric) rem = (rem * 10 + Number(ch)) % 97;
  return rem === 1 ? iban : null;
}

/** T.C. kimlik numarası denetimi */
export function isValidTckn(v: string): boolean {
  if (!/^[1-9]\d{10}$/.test(v)) return false;
  const d = v.split('').map(Number);
  const odd = d[0]! + d[2]! + d[4]! + d[6]! + d[8]!;
  const even = d[1]! + d[3]! + d[5]! + d[7]!;
  if ((((odd * 7 - even) % 10) + 10) % 10 !== d[9]) return false;
  return d.slice(0, 10).reduce((a, b) => a + b, 0) % 10 === d[10];
}

/** Vergi kimlik numarası denetimi (10 hane) */
export function isValidVkn(v: string): boolean {
  if (!/^\d{10}$/.test(v)) return false;
  const d = v.split('').map(Number);
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const tmp = (d[i]! + 10 - (i + 1)) % 10;
    if (tmp === 9) sum += 9;
    else sum += (tmp * 2 ** (10 - (i + 1))) % 9;
  }
  return (10 - (sum % 10)) % 10 === d[9];
}

export const maskIban = (iban: string) => `${iban.slice(0, 4)} **** **** **** **** ${iban.slice(-4)}`;
