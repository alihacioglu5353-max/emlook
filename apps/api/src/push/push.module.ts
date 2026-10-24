import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { SettingsService } from '../settings/settings.service.js';
import { DevicesController } from './devices.controller.js';
import { FcmPushProvider, parseServiceAccount } from './fcm.js';
import { LogPushProvider, MemoryPushProvider, PushProvider, PushService } from './push.service.js';

@Global()
@Module({
  controllers: [DevicesController],
  providers: [
    {
      provide: PushProvider,
      inject: [ConfigService, SettingsService],
      // Yönetim > Ayarlar'daki Firebase etkinse açılışta o kullanılır
      useFactory: async (config: ConfigService<Env, true>, settings: SettingsService): Promise<PushProvider> => {
        const provider = config.get('PUSH_PROVIDER', { infer: true });
        if (provider !== 'memory') {
          const db = await settings.activeIntegration('fcm').catch(() => null);
          if (db?.serviceAccount) return new FcmPushProvider(parseServiceAccount(String(db.serviceAccount)));
        }
        switch (config.get('PUSH_PROVIDER', { infer: true })) {
          case 'memory':
            return new MemoryPushProvider();
          case 'fcm':
            return new FcmPushProvider(parseServiceAccount(config.get('FCM_SERVICE_ACCOUNT', { infer: true })!));
          default:
            return new LogPushProvider();
        }
      },
    },
    PushService,
  ],
  exports: [PushService, PushProvider],
})
export class PushModule {}
