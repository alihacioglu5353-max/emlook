import { decodeCursor, encodeCursor } from './cursor.js';

describe('sayfa imleci', () => {
  it('kodlar ve çözer', () => {
    const id = '0b6f3c1e-8d2a-4a7b-9f1e-2c3d4e5f6a7b';
    const c = decodeCursor(encodeCursor(new Date('2026-10-24T10:00:00.000Z'), id));
    expect(c).toEqual({ at: new Date('2026-10-24T10:00:00.000Z'), id });
  });

  it('boş imleç null, bozuk imleç 400', () => {
    expect(decodeCursor(undefined)).toBeNull();
    expect(() => decodeCursor('bozuk')).toThrow('Geçersiz sayfa imleci');
  });
});
