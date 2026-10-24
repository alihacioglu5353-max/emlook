import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { DevicesController } from './devices.controller.js';
import { FcmPushProvider, parseServiceAccount } from './fcm.js';
import { LogPushProvider, MemoryPushProvider, PushProvider, PushService } from './push.service.js';

@Global()
@Module({
  controllers: [DevicesController],
  providers: [
    {
      provide: PushProvider,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): PushProvider => {
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
