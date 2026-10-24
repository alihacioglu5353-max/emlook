import { Controller, Get, Header, NotFoundException, Param, ParseIntPipe } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { asc, eq } from 'drizzle-orm';
import { Public } from '../common/auth.decorators.js';
import { InjectDb, type Database } from '../db/db.module.js';
import { cities, districts, neighbourhoods } from '../db/schema.js';

/** İl → ilçe → mahalle seçimi için. Veri nadiren değiştiğinden önbelleklenebilir. */
@ApiTags('locations')
@Public()
@Controller('locations')
export class LocationsController {
  constructor(@InjectDb() private readonly db: Database) {}

  @Get('cities')
  @Header('Cache-Control', 'public, max-age=86400')
  @ApiOperation({ summary: '81 il (plaka koduyla)' })
  cities() {
    return this.db.select().from(cities).orderBy(asc(cities.code));
  }

  @Get('cities/:code/districts')
  @Header('Cache-Control', 'public, max-age=86400')
  @ApiOperation({ summary: 'İlin ilçeleri' })
  async districts(@Param('code') code: string) {
    const rows = await this.db
      .select({ id: districts.id, name: districts.name })
      .from(districts)
      .where(eq(districts.cityCode, code))
      .orderBy(asc(districts.name));
    if (rows.length === 0) throw new NotFoundException('İl bulunamadı');
    return rows;
  }

  @Get('districts/:id/neighbourhoods')
  @Header('Cache-Control', 'public, max-age=86400')
  @ApiOperation({ summary: 'İlçenin mahalle ve köyleri' })
  neighbourhoods(@Param('id', ParseIntPipe) id: number) {
    return this.db
      .select({ id: neighbourhoods.id, name: neighbourhoods.name })
      .from(neighbourhoods)
      .where(eq(neighbourhoods.districtId, id))
      .orderBy(asc(neighbourhoods.name));
  }
}
