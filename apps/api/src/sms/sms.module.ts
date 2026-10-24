import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { NetgsmSmsService } from './netgsm.js';
import { ConsoleSmsService, MemorySmsService, SmsService } from './sms.service.js';

@Global()
@Module({
  providers: [
    {
      provide: SmsService,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): SmsService => {
        switch (config.get('SMS_PROVIDER', { infer: true })) {
          case 'memory':
            return new MemorySmsService();
          case 'netgsm':
            return new NetgsmSmsService(config.get('NETGSM', { infer: true })!);
          default:
            return new ConsoleSmsService();
        }
      },
    },
  ],
  exports: [SmsService],
})
export class SmsModule {}
