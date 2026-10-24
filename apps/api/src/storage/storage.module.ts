import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { LocalStorageService, S3StorageService, StorageService } from './storage.service.js';

@Global()
@Module({
  providers: [
    {
      provide: StorageService,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): StorageService => {
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
