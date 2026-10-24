import { NotFoundException } from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { sdkStreamMixin } from '@smithy/util-stream';
import { mockClient } from 'aws-sdk-client-mock';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { LocalStorageService, S3StorageService } from './storage.service.js';

const read = async (r: Readable) => {
  const chunks: Buffer[] = [];
  for await (const c of r) chunks.push(Buffer.from(c as Buffer));
  return Buffer.concat(chunks);
};

describe('LocalStorageService', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'emlook-storage-'));
  const storage = new LocalStorageService(dir);

  it('yazar, okur ve siler', async () => {
    const key = await storage.put('listings/abc', Buffer.from('foto'), 'jpg');
    expect(key).toMatch(/^listings\/abc\/[0-9a-f-]{36}\.jpg$/);
    expect((await read(await storage.stream(key))).toString()).toBe('foto');
    await storage.remove(key);
    await expect(storage.stream(key)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('kök dışına çıkan anahtarı reddeder', async () => {
    await expect(storage.stream('../../etc/passwd')).rejects.toThrow('Geçersiz depolama anahtarı');
  });

  it('önek ve uzantıdaki tehlikeli karakterleri temizler', async () => {
    const key = await storage.put('../x/./y', Buffer.from('a'), 'p/n.g');
    expect(key.startsWith('x/y/')).toBe(true);
    expect(key.endsWith('.png')).toBe(true);
  });
});

describe('S3StorageService', () => {
  const s3 = mockClient(S3Client);
  const storage = new S3StorageService(
    {
      bucket: 'emlook',
      region: 'auto',
      endpoint: 'https://hesap.r2.cloudflarestorage.com',
      accessKeyId: 'k',
      secretAccessKey: 's',
      forcePathStyle: false,
      prefix: 'prod/',
    },
    new S3Client({ region: 'auto' }),
  );

  beforeEach(() => s3.reset());

  it('önekli anahtar ve içerik türüyle yükler', async () => {
    s3.on(PutObjectCommand).resolves({});
    const key = await storage.put('verification/u1', Buffer.from('%PDF'), 'pdf', 'application/pdf');
    const input = s3.commandCalls(PutObjectCommand)[0].args[0].input;
    expect(input.Bucket).toBe('emlook');
    expect(input.Key).toBe(`prod/${key}`);
    expect(input.ContentType).toBe('application/pdf');
  });

  it('dosyayı akış olarak okur', async () => {
    s3.on(GetObjectCommand).resolves({ Body: sdkStreamMixin(Readable.from([Buffer.from('merhaba')])) });
    expect((await read(await storage.stream('listings/l1/a.jpg'))).toString()).toBe('merhaba');
    expect(s3.commandCalls(GetObjectCommand)[0].args[0].input.Key).toBe('prod/listings/l1/a.jpg');
  });

  it('olmayan dosyada 404 verir', async () => {
    s3.on(GetObjectCommand).rejects(new NoSuchKey({ message: 'yok', $metadata: {} }));
    await expect(storage.stream('listings/l1/yok.jpg')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('siler; hata olsa da sessiz geçer', async () => {
    s3.on(DeleteObjectCommand).rejects(new Error('ağ'));
    await expect(storage.remove('listings/l1/a.jpg')).resolves.toBeUndefined();
  });

  it('".." içeren anahtarı reddeder', async () => {
    await expect(storage.stream('../gizli')).rejects.toThrow('Geçersiz depolama anahtarı');
  });
});
