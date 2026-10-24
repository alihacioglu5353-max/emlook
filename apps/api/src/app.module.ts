import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.module.js';
import { AgentsModule } from './agents/agents.module.js';
import { AuthModule } from './auth/auth.module.js';
import { JwtAuthGuard, RolesGuard } from './common/auth.guards.js';
import { CommonModule } from './common/common.module.js';
import { validateEnv, type Env } from './config/env.js';
import { DbModule } from './db/db.module.js';
import { DiscoverModule } from './discover/discover.module.js';
import { FeedModule } from './feed/feed.module.js';
import { HealthController } from './health.controller.js';
import { LegalModule } from './legal/legal.controller.js';
import { MailModule } from './mail/mail.service.js';
import { SettingsModule } from './settings/settings.module.js';
import { ListingsModule } from './listings/listings.module.js';
import { MessagingModule } from './messaging/messaging.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { OfficesModule } from './offices/offices.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { PushModule } from './push/push.module.js';
import { SearchModule } from './search/search.module.js';
import { SmsModule } from './sms/sms.module.js';
import { StorageModule } from './storage/storage.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_ACCESS_SECRET', { infer: true }),
      }),
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 120 }],
      skipIf: () => process.env.NODE_ENV === 'test',
    }),
    DbModule,
    CommonModule,
    SettingsModule,
    SmsModule,
    MailModule,
    StorageModule,
    AuthModule,
    UsersModule,
    AgentsModule,
    AdminModule,
    PushModule,
    NotificationsModule,
    OfficesModule,
    LegalModule,
    ListingsModule,
    FeedModule,
    DiscoverModule,
    SearchModule,
    MessagingModule,
    PaymentsModule,
  ],
  controllers: [HealthController],
  providers: [
    // Sıra önemli: önce hız sınırı, sonra kimlik, sonra rol.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
