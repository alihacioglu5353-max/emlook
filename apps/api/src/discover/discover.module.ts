import { Module } from '@nestjs/common';
import { ListingsModule } from '../listings/listings.module.js';
import { MessagingModule } from '../messaging/messaging.module.js';
import { DiscoverController } from './discover.controller.js';
import { DiscoverService } from './discover.service.js';

@Module({
  imports: [ListingsModule, MessagingModule],
  controllers: [DiscoverController],
  providers: [DiscoverService],
  exports: [DiscoverService],
})
export class DiscoverModule {}
