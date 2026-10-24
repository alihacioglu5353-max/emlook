import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type AuthUser, CurrentUser } from '../common/auth.decorators.js';
import { DiscoverService } from './discover.service.js';
import { DiscoverQuery, InterestDto, InterestListQuery, SwipeDto } from './dto.js';

const uuid = new ParseUUIDPipe();
const viewerOf = (u: AuthUser) => ({ id: u.id, role: u.role });

@ApiTags('discover')
@ApiBearerAuth()
@Controller()
export class DiscoverController {
  constructor(private readonly discover: DiscoverService) {}

  @Get('discover')
  @ApiOperation({ summary: 'Keşfet kartları (henüz karar verilmemiş, puana göre sıralı)' })
  cards(@CurrentUser() user: AuthUser, @Query() q: DiscoverQuery) {
    return this.discover.cards(viewerOf(user), q);
  }

  @Post('discover/:listingId/swipe')
  @HttpCode(200)
  @ApiOperation({ summary: 'Sağa (like → ilgi gönderilir) veya sola (pass) kaydır' })
  swipe(@CurrentUser() user: AuthUser, @Param('listingId', uuid) id: string, @Body() dto: SwipeDto) {
    return this.discover.swipe(viewerOf(user), id, dto);
  }

  @Post('discover/undo')
  @HttpCode(200)
  @ApiOperation({ summary: 'Son kararı geri al (10 dakika içinde)' })
  undo(@CurrentUser() user: AuthUser) {
    return this.discover.undo(viewerOf(user));
  }

  @Post('listings/:id/interest')
  @HttpCode(200)
  @ApiOperation({ summary: '"İlgileniyorum" — ilan sahibine el sıkışma isteği' })
  express(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string, @Body() dto: InterestDto) {
    return this.discover.express(viewerOf(user), id, dto.note);
  }

  @Get('listings/:id/interest')
  @ApiOperation({ summary: 'Bu ilana açık ilgim (yoksa null)' })
  async mine(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return { interest: await this.discover.mine(user.id, id) };
  }

  @Get('interests/incoming')
  @ApiOperation({ summary: 'İlanlarıma gelen ilgiler' })
  incoming(@CurrentUser() user: AuthUser, @Query() q: InterestListQuery) {
    return this.discover.list(user.id, 'incoming', q);
  }

  @Get('interests/outgoing')
  @ApiOperation({ summary: 'Gönderdiğim ilgiler' })
  outgoing(@CurrentUser() user: AuthUser, @Query() q: InterestListQuery) {
    return this.discover.list(user.id, 'outgoing', q);
  }

  @Get('interests/:id')
  detail(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.discover.detail(user.id, id);
  }

  @Post('interests/:id/accept')
  @HttpCode(200)
  @ApiOperation({ summary: 'İlgiyi kabul et (eşleşme)' })
  accept(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.discover.decide(viewerOf(user), id, 'accepted');
  }

  @Post('interests/:id/decline')
  @HttpCode(200)
  decline(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.discover.decide(viewerOf(user), id, 'declined');
  }

  @Post('interests/:id/withdraw')
  @HttpCode(200)
  withdraw(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.discover.withdraw(viewerOf(user), id);
  }
}
