import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { EidsProvider, ManualEidsProvider, MockEidsProvider } from '../eids/eids.service.js';
import { LocationsController } from '../locations/locations.controller.js';
import { ListingsController } from './listings.controller.js';
import { ListingsService } from './listings.service.js';

@Module({
  controllers: [ListingsController, LocationsController],
  providers: [
    ListingsService,
    {
      provide: EidsProvider,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        config.get('EIDS_PROVIDER', { infer: true }) === 'mock'
          ? new MockEidsProvider()
          : new ManualEidsProvider(),
    },
  ],
  exports: [ListingsService],
})
export class ListingsModule {}
