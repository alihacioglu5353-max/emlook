import { Global, Module } from '@nestjs/common';
import { SettingsController } from './settings.controller.js';
import { BadgesService } from './badges.service.js';
import { LogsService } from './logs.service.js';
import { SettingsService } from './settings.service.js';

@Global()
@Module({
  controllers: [SettingsController],
  providers: [SettingsService, BadgesService, LogsService],
  exports: [SettingsService, BadgesService],
})
export class SettingsModule {}
