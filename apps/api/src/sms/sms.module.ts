import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { SettingsService } from '../settings/settings.service.js';
import { NetgsmSmsService } from './netgsm.js';
import { ConsoleSmsService, MemorySmsService, SmsService } from './sms.service.js';

/** Yönetim > Ayarlar'da Netgsm etkinse o kullanılır; değilse ortam değişkenindeki sağlayıcı */
export class SettingsAwareSmsService extends SmsService {
  private cached: { sig: string; svc: NetgsmSmsService } | null = null;
  constructor(
    private readonly fallback: SmsService,
    private readonly settings: SettingsService,
  ) {
    super();
  }
  async send(to: string, body: string): Promise<void> {
    const s = await this.settings.activeIntegration('netgsm');
    if (!s) return this.fallback.send(to, body);
    const sig = JSON.stringify(s);
    if (this.cached?.sig !== sig) {
      this.cached = {
        sig,
        svc: new NetgsmSmsService({
          userCode: String(s.userCode),
          password: String(s.password),
          header: String(s.header),
          useOtpEndpoint: s.useOtpEndpoint !== false,
          baseUrl: String(s.baseUrl || 'https://api.netgsm.com.tr').replace(/\/$/, ''),
        }),
      };
    }
    return this.cached.svc.send(to, body);
  }
}

@Global()
@Module({
  providers: [
    {
      provide: SmsService,
      inject: [ConfigService, SettingsService],
      useFactory: (config: ConfigService<Env, true>, settings: SettingsService): SmsService => {
        switch (config.get('SMS_PROVIDER', { infer: true })) {
          case 'memory':
            // Testler mesaj kutusunu doğrudan okur
            return new MemorySmsService();
          case 'netgsm':
            return new SettingsAwareSmsService(new NetgsmSmsService(config.get('NETGSM', { infer: true })!), settings);
          default:
            return new SettingsAwareSmsService(new ConsoleSmsService(), settings);
        }
      },
    },
  ],
  exports: [SmsService],
})
export class SmsModule {}
