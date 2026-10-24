import { NotFoundException } from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';

/**
 * Dosya depolama soyutlaması: `local` (geliştirme, tek sunucu) ve `s3`
 * (AWS S3, Cloudflare R2, MinIO). Dosyalar herkese açık URL ile sunulmaz;
 * yalnızca yetkili uç noktalar akıtır.
 */
export abstract class StorageService {
  /** Dosyayı yazar, benzersiz anahtarını döndürür. */
  abstract put(prefix: string, buffer: Buffer, ext: string, contentType?: string): Promise<string>;
  /** Dosya akışı; yoksa NotFoundException. */
  abstract stream(key: string): Promise<Readable>;
  /** Dosyayı siler; yoksa sessizce geçer. */
  abstract remove(key: string): Promise<void>;

  protected newKey(prefix: string, ext: string): string {
    const safePrefix = prefix
      .split('/')
      .map((seg) => seg.replace(/[^a-zA-Z0-9_-]/g, ''))
      .filter(Boolean)
      .join('/');
    const safeExt = ext.replace(/[^a-z0-9]/gi, '').slice(0, 8);
    return `${safePrefix}/${randomUUID()}${safeExt ? '.' + safeExt : ''}`;
  }
}

const missing = () => new NotFoundException('Dosya bulunamadı');

export class LocalStorageService extends StorageService {
  private readonly root: string;

  constructor(dir: string) {
    super();
    this.root = path.resolve(dir);
  }

  async put(prefix: string, buffer: Buffer, ext: string): Promise<string> {
    const key = this.newKey(prefix, ext);
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, buffer, { flag: 'wx' });
    return key;
  }

  async stream(key: string): Promise<Readable> {
    const full = this.resolve(key);
    await access(full).catch(() => {
      throw missing();
    });
    return createReadStream(full);
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

export interface S3Config {
  bucket: string;
  region: string;
  /** R2 / MinIO için uç nokta; AWS'de boş */
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** MinIO gibi path-style isteyen sunucular */
  forcePathStyle: boolean;
  /** Tüm anahtarların önüne eklenir (örn. "prod/") */
  prefix: string;
}

export class S3StorageService extends StorageService {
  private readonly client: S3Client;

  constructor(
    private readonly config: S3Config,
    client?: S3Client,
  ) {
    super();
    this.client =
      client ??
      new S3Client({
        region: config.region,
        endpoint: config.endpoint,
        forcePathStyle: config.forcePathStyle,
        credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      });
  }

  private objectKey(key: string) {
    if (key.includes('..')) throw new Error('Geçersiz depolama anahtarı');
    return this.config.prefix + key;
  }

  async put(prefix: string, buffer: Buffer, ext: string, contentType?: string): Promise<string> {
    const key = this.newKey(prefix, ext);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: this.objectKey(key),
        Body: buffer,
        ContentType: contentType,
      }),
    );
    return key;
  }

  async stream(key: string): Promise<Readable> {
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.config.bucket, Key: this.objectKey(key) }),
      );
      const body = res.Body;
      if (!body) throw missing();
      return body instanceof Readable ? body : Readable.fromWeb(body.transformToWebStream() as never);
    } catch (e) {
      if (e instanceof NoSuchKey || (e as { name?: string }).name === 'NoSuchKey') throw missing();
      throw e;
    }
  }

  async remove(key: string): Promise<void> {
    await this.client
      .send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: this.objectKey(key) }))
      .catch(() => undefined);
  }
}
