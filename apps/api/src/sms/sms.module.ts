import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import {
  ConsoleSmsService,
  MemorySmsService,
  SmsService,
} from './sms.service.js';

@Global()
@Module({
  providers: [
    {
      provide: SmsService,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        config.get('SMS_PROVIDER', { infer: true }) === 'memory'
          ? new MemorySmsService()
          : new ConsoleSmsService(),
    },
  ],
  exports: [SmsService],
})
export class SmsModule {}
