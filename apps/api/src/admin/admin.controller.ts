import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type AuthUser, CurrentUser, Roles } from '../common/auth.decorators.js';
import { AdminService } from './admin.service.js';
import { ListVerificationsQuery, RejectDto } from './dto.js';

@ApiTags('admin')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('verifications')
  @ApiOperation({ summary: 'Danışman başvurularını duruma göre listeler' })
  list(@Query() q: ListVerificationsQuery) {
    return this.admin.list(q.status ?? 'pending', q.limit ?? 20, q.offset ?? 0);
  }

  @Get('verifications/counts')
  @ApiOperation({ summary: 'Durum başına başvuru sayıları' })
  counts() {
    return this.admin.counts();
  }

  @Get('verifications/:userId')
  @ApiOperation({ summary: 'Başvuru detayı ve belgeler' })
  detail(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.admin.detail(userId);
  }

  @Post('verifications/:userId/approve')
  @HttpCode(200)
  @ApiOperation({ summary: 'Başvuruyu onaylar; danışman onaylı rozet alır' })
  approve(
    @CurrentUser() admin: AuthUser,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.admin.approve(admin.id, userId);
  }

  @Post('verifications/:userId/reject')
  @HttpCode(200)
  @ApiOperation({ summary: 'Başvuruyu gerekçeyle reddeder' })
  reject(
    @CurrentUser() admin: AuthUser,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: RejectDto,
  ) {
    return this.admin.reject(admin.id, userId, dto.reason);
  }

  @Get('documents/:id/file')
  @ApiOperation({ summary: 'Doğrulama belgesini görüntüler' })
  document(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.streamDocument(id);
  }
}
