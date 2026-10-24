import { BadRequestException } from '@nestjs/common';

/**
 * Zaman + kimlik çiftiyle sabit sıralı sayfalama imleci (base64url).
 * JavaScript tarihi milisaniye hassasiyetindedir; Postgres mikro saniye tutar.
 * Bu yüzden karşılaştırmalarda sütun date_trunc('milliseconds', …) ile kırpılır.
 */
export interface Cursor {
  at: Date;
  id: string;
}

export function encodeCursor(at: Date | string, id: string): string {
  const iso = typeof at === 'string' ? new Date(at).toISOString() : at.toISOString();
  return Buffer.from(`${iso}|${id}`).toString('base64url');
}

export function decodeCursor(raw?: string): Cursor | null {
  if (!raw) return null;
  const [iso, id] = Buffer.from(raw, 'base64url').toString('utf8').split('|');
  const at = new Date(iso ?? '');
  if (!id || Number.isNaN(at.getTime()) || !/^[0-9a-f-]{36}$/i.test(id)) {
    throw new BadRequestException({ code: 'BAD_CURSOR', message: 'Geçersiz sayfa imleci' });
  }
  return { at, id };
}
