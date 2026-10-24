import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/**
 * Parola özeti: scrypt (Node yerleşik, ek bağımlılık yok).
 * Biçim: `scrypt$N$r$p$tuz$özet` (base64url) — parametreler özetle birlikte saklandığı
 * için ileride güçlendirilebilir; eski özetler doğrulanmaya devam eder.
 */
const N = 16_384;
const R = 8;
const P = 1;
const KEYLEN = 64;

function derive(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password.normalize('NFKC'), salt, KEYLEN, { N: n, r, p, maxmem: 64 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N, R, P);
  return ['scrypt', N, R, P, salt.toString('base64url'), key.toString('base64url')].join('$');
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) {
    // Kullanıcı yoksa da aynı sürede yanıt ver (e-posta varlığı zamanlamadan anlaşılmasın)
    await derive(password, DUMMY_SALT, N, R, P);
    return false;
  }
  const [algo, n, r, p, salt, hash] = stored.split('$');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const actual = await derive(password, Buffer.from(salt, 'base64url'), Number(n), Number(r), Number(p));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
const DUMMY_SALT = randomBytes(16);

/** Parola kuralı: 8–128 karakter, en az bir harf ve bir rakam. Hata metni döner, uygunsa null. */
export function passwordProblem(password: string): string | null {
  if (password.length < 8) return 'Parola en az 8 karakter olmalı';
  if (password.length > 128) return 'Parola en fazla 128 karakter olabilir';
  if (!/\p{L}/u.test(password) || !/\d/.test(password)) return 'Parola en az bir harf ve bir rakam içermeli';
  return null;
}
