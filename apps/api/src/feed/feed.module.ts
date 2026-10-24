import { Module } from '@nestjs/common';
import { ListingsModule } from '../listings/listings.module.js';
import { FeedController } from './feed.controller.js';
import { FeedService } from './feed.service.js';

@Module({
  imports: [ListingsModule],
  controllers: [FeedController],
  providers: [FeedService],
  exports: [FeedService],
})
export class FeedModule {}
