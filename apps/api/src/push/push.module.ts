import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { DevicesController } from './devices.controller.js';
import { LogPushProvider, MemoryPushProvider, PushProvider, PushService } from './push.service.js';

@Global()
@Module({
  controllers: [DevicesController],
  providers: [
    {
      provide: PushProvider,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        config.get('PUSH_PROVIDER', { infer: true }) === 'memory' ? new MemoryPushProvider() : new LogPushProvider(),
    },
    PushService,
  ],
  exports: [PushService, PushProvider],
})
export class PushModule {}
