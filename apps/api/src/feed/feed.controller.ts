import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type AuthUser, CurrentUser } from '../common/auth.decorators.js';
import { FeedQuery, PageQuery } from './dto.js';
import { FeedService } from './feed.service.js';

const uuid = new ParseUUIDPipe();
const viewerOf = (u: AuthUser) => ({ id: u.id, role: u.role });

@ApiTags('feed')
@ApiBearerAuth()
@Controller()
export class FeedController {
  constructor(private readonly feed: FeedService) {}

  @Get('feed')
  @ApiOperation({ summary: 'Akış: Emlook Ağı (all) veya Benim Ağım (network)' })
  list(@CurrentUser() user: AuthUser, @Query() q: FeedQuery) {
    return this.feed.feed(viewerOf(user), q);
  }

  @Get('me/saved')
  @ApiOperation({ summary: 'Kaydettiğim ilanlar' })
  saved(@CurrentUser() user: AuthUser, @Query() q: PageQuery) {
    return this.feed.saved(viewerOf(user), q);
  }

  @Get('me/suggestions')
  @ApiOperation({ summary: 'Takip önerileri' })
  suggestions(@CurrentUser() user: AuthUser) {
    return this.feed.suggestions(viewerOf(user));
  }

  @Post('listings/:id/like')
  @HttpCode(200)
  like(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.feed.like(viewerOf(user), id);
  }

  @Delete('listings/:id/like')
  unlike(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.feed.unlike(viewerOf(user), id);
  }

  @Post('listings/:id/save')
  @HttpCode(200)
  save(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.feed.save(viewerOf(user), id);
  }

  @Delete('listings/:id/save')
  unsave(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.feed.unsave(viewerOf(user), id);
  }

  @Post('agents/:id/follow')
  @HttpCode(200)
  @ApiOperation({ summary: 'Danışmanı takip et' })
  follow(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.feed.follow(viewerOf(user), id);
  }

  @Delete('agents/:id/follow')
  unfollow(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.feed.unfollow(viewerOf(user), id);
  }

  @Get('agents/:id/listings')
  @ApiOperation({ summary: 'Danışmanın yayındaki ilanları' })
  agentListings(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string, @Query() q: PageQuery) {
    return this.feed.agentListings(viewerOf(user), id, q);
  }

  @Get('users/:id/followers')
  followers(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string, @Query() q: PageQuery) {
    return this.feed.people(viewerOf(user), id, 'followers', q);
  }

  @Get('users/:id/following')
  following(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string, @Query() q: PageQuery) {
    return this.feed.people(viewerOf(user), id, 'following', q);
  }
}
