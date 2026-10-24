import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type AuthUser, CurrentUser } from '../common/auth.decorators.js';
import { AgentSearchQuery, SearchQuery } from './dto.js';
import { SearchService } from './search.service.js';

@ApiTags('search')
@ApiBearerAuth()
@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  @ApiOperation({ summary: 'İlan araması: serbest metin ayrıştırılır, filtrelerle birleşir' })
  listings(@CurrentUser() user: AuthUser, @Query() q: SearchQuery) {
    return this.search.search({ id: user.id, role: user.role }, q);
  }

  @Get('agents')
  @ApiOperation({ summary: 'Danışman araması (ad, unvan, ofis)' })
  agents(@CurrentUser() user: AuthUser, @Query() q: AgentSearchQuery) {
    return this.search.agents({ id: user.id, role: user.role }, q.q);
  }
}
