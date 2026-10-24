import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type AuthUser, CurrentUser } from '../common/auth.decorators.js';
import { MessagesQuery, SendMessageDto, StartConversationDto } from './dto.js';
import { MessagingService } from './messaging.service.js';

const uuid = new ParseUUIDPipe();
const viewerOf = (u: AuthUser) => ({ id: u.id, role: u.role });

@ApiTags('messaging')
@ApiBearerAuth()
@Controller('conversations')
export class MessagingController {
  constructor(private readonly messaging: MessagingService) {}

  @Get()
  @ApiOperation({ summary: 'Konuşmalarım (son mesaj, okunmamış sayısı)' })
  list(@CurrentUser() user: AuthUser) {
    return this.messaging.conversations(user.id);
  }

  @Get('unread')
  @ApiOperation({ summary: 'Okunmamış konuşma ve mesaj sayısı' })
  unread(@CurrentUser() user: AuthUser) {
    return this.messaging.unread(user.id);
  }

  @Get('with/:userId')
  @ApiOperation({ summary: 'Kullanıcıyla konuşma (yoksa null)' })
  async withUser(@CurrentUser() user: AuthUser, @Param('userId', uuid) userId: string) {
    return { conversation: await this.messaging.withUser(user.id, userId) };
  }

  @Post()
  @ApiOperation({ summary: 'Konuşma başlat ya da var olana yaz (ilan bağlamı isteğe bağlı)' })
  start(@CurrentUser() user: AuthUser, @Body() dto: StartConversationDto) {
    return this.messaging.start(viewerOf(user), dto);
  }

  @Get(':id')
  summary(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.messaging.summary(user.id, id);
  }

  @Get(':id/messages')
  @ApiOperation({ summary: 'Mesajlar: cursor ile eskiler, after ile yeniler' })
  messages(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string, @Query() q: MessagesQuery) {
    return this.messaging.list(viewerOf(user), id, q);
  }

  @Post(':id/messages')
  send(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string, @Body() dto: SendMessageDto) {
    return this.messaging.send(viewerOf(user), id, dto);
  }

  @Post(':id/read')
  @HttpCode(200)
  read(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.messaging.markRead(user.id, id);
  }
}
