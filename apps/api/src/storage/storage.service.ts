import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import type { Env } from '../config/env.js';

/**
 * Dosya depolama soyutlaması. Şu an yerel disk kullanılıyor; üretimde
 * S3 uyumlu bir sürücü (AWS S3, Cloudflare R2, MinIO) aynı arayüzle eklenecek.
 * Belgeler herkese açık URL ile sunulmaz; yalnızca yetkili uç noktalar akıtır.
 */
@Injectable()
export class StorageService {
  private readonly root: string;

  constructor(config: ConfigService<Env, true>) {
    this.root = path.resolve(config.get('STORAGE_DIR', { infer: true }));
  }

  async put(prefix: string, buffer: Buffer, ext: string): Promise<string> {
    const safeExt = ext.replace(/[^a-z0-9]/gi, '').slice(0, 8);
    const key = `${prefix}/${randomUUID()}${safeExt ? '.' + safeExt : ''}`;
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, buffer, { flag: 'wx' });
    return key;
  }

  stream(key: string): Readable {
    return createReadStream(this.resolve(key));
  }

  async remove(key: string): Promise<void> {
    await unlink(this.resolve(key)).catch(() => undefined);
  }

  /** Anahtarın depolama kökünün dışına çıkmasını engeller. */
  private resolve(key: string): string {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) {
      throw new Error('Geçersiz depolama anahtarı');
    }
    return full;
  }
}
