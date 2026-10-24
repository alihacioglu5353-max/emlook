import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { SettingsService } from '../settings/settings.service.js';
import { LocalStorageService, S3StorageService, StorageService } from './storage.service.js';

@Global()
@Module({
  providers: [
    {
      provide: StorageService,
      inject: [ConfigService, SettingsService],
      // Yönetim > Ayarlar'daki S3 etkinse açılışta o kullanılır (değişiklik yeniden başlatınca uygulanır)
      useFactory: async (config: ConfigService<Env, true>, settings: SettingsService): Promise<StorageService> => {
        const db = config.get('NODE_ENV', { infer: true }) === 'test' ? null : await settings.activeIntegration('s3').catch(() => null);
        if (db) {
          return new S3StorageService({
            bucket: String(db.bucket),
            region: String(db.region || 'auto'),
            endpoint: (db.endpoint as string) || undefined,
            accessKeyId: String(db.accessKeyId),
            secretAccessKey: String(db.secretAccessKey),
            forcePathStyle: db.forcePathStyle === true,
            prefix: String(db.prefix || '').replace(/^\/+/, ''),
          });
        }
        const s3 = config.get('S3', { infer: true });
        return config.get('STORAGE_DRIVER', { infer: true }) === 's3' && s3
          ? new S3StorageService(s3)
          : new LocalStorageService(config.get('STORAGE_DIR', { infer: true }));
      },
    },
  ],
  exports: [StorageService],
})
export class StorageModule {}
