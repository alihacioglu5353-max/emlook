import { Module } from '@nestjs/common';
import { FeedModule } from '../feed/feed.module.js';
import { SearchController } from './search.controller.js';
import { SearchService } from './search.service.js';

@Module({
  imports: [FeedModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
