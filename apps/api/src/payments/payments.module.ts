import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { PaymentsController, PublicPayController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';
import { MockPaymentProvider, PaymentProvider } from './provider.js';

@Module({
  controllers: [PaymentsController, PublicPayController],
  providers: [
    PaymentsService,
    {
      provide: PaymentProvider,
      inject: [ConfigService],
      // Trinkle360 sağlayıcısı eklenince PAYMENT_PROVIDER ile seçilecek
      useFactory: (config: ConfigService<Env, true>) =>
        new MockPaymentProvider(
          config.get('PAYMENT_WEBHOOK_SECRET', { infer: true }),
          config.get('PUBLIC_WEB_URL', { infer: true }),
        ),
    },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
