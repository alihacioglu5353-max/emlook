import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { sql } from 'drizzle-orm';
import { Public } from './common/auth.decorators.js';
import { InjectDb, type Database } from './db/db.module.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@InjectDb() private readonly db: Database) {}

  @Public()
  @Get()
  async check() {
    try {
      await this.db.execute(sql`select 1`);
    } catch {
      throw new ServiceUnavailableException({ status: 'down', db: 'down' });
    }
    return { status: 'ok', db: 'up' };
  }
}
