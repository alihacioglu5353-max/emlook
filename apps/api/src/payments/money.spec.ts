import { isValidTckn, isValidVkn, maskIban, normalizeIban, splitAmount, vatFromGross } from './money.js';

describe('para hesapları', () => {
  it('komisyonu platform, ilan ve alıcı danışmanı arasında böler', () => {
    // 100.000 TL komisyon, %5 platform, kalan %50-%50
    expect(splitAmount(10_000_000, 500, 50)).toEqual({ platform: 500_000, seller: 4_750_000, buyer: 4_750_000 });
    // Paylaşımsız
    expect(splitAmount(10_000_000, 500, 0)).toEqual({ platform: 500_000, seller: 9_500_000, buyer: 0 });
    // Yuvarlama artığı ilan danışmanında; toplam korunur
    const s = splitAmount(1_001, 333, 33);
    expect(s.platform + s.seller + s.buyer).toBe(1_001);
    expect(() => splitAmount(10.5, 500, 0)).toThrow();
  });

  it('KDV dahil tutardan net ve KDV', () => {
    expect(vatFromGross(12_000, 2000)).toEqual({ net: 10_000, vat: 2_000, total: 12_000 });
    const v = vatFromGross(500_000, 2000);
    expect(v.net + v.vat).toBe(500_000);
  });

  it('IBAN doğrulama ve maskeleme', () => {
    expect(normalizeIban('tr33 0006 1005 1978 6457 8413 26')).toBe('TR330006100519786457841326');
    expect(normalizeIban('TR330006100519786457841327')).toBeNull();
    expect(normalizeIban('DE89370400440532013000')).toBeNull();
    expect(maskIban('TR330006100519786457841326')).toBe('TR33 **** **** **** **** 1326');
  });

  it('TCKN ve VKN doğrulama', () => {
    expect(isValidTckn('10000000146')).toBe(true);
    expect(isValidTckn('10000000147')).toBe(false);
    expect(isValidTckn('00000000146')).toBe(false);
    expect(isValidVkn('1234567890')).toBe(true);
    expect(isValidVkn('1234567891')).toBe(false);
    expect(isValidVkn('123456789')).toBe(false);
  });
});
