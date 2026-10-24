import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RejectDto } from '../admin/dto.js';
import { type AuthUser, CurrentUser, Roles } from '../common/auth.decorators.js';
import {
  ChangeRoleDto,
  CreateOfficeDto,
  InviteDto,
  ListOfficesQuery,
  SearchOfficesQuery,
  UpdateOfficeDto,
} from './dto.js';
import { OfficesService } from './offices.service.js';

const uuid = new ParseUUIDPipe();

/** Ofis arama, profil, açma ve sahip/yönetici işlemleri */
@ApiTags('offices')
@ApiBearerAuth()
@Controller('offices')
export class OfficesController {
  constructor(private readonly offices: OfficesService) {}

  @Get()
  @ApiOperation({ summary: 'Aktif ofislerde ada veya ile göre arama' })
  search(@Query() q: SearchOfficesQuery) {
    return this.offices.search(q.q, q.city, q.limit ?? 20);
  }

  @Roles('agent')
  @Post()
  @ApiOperation({ summary: 'Ofis açar (onaylı danışman); yönetici onayına gider' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateOfficeDto) {
    return this.offices.create(user.id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Ofis profili ve ekip' })
  profile(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.offices.profile(id, user);
  }

  @Roles('agent')
  @Post(':id/join-requests')
  @ApiOperation({ summary: 'Ofise katılma talebi gönderir' })
  requestJoin(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.offices.requestJoin(user.id, id);
  }

  // ---- Sahip / yönetici ----

  @Roles('agent')
  @Get(':id/manage')
  @ApiOperation({ summary: 'Ofis paneli: üyeler, bekleyen talepler ve davetler' })
  manage(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.offices.manage(user.id, id);
  }

  @Roles('agent')
  @Patch(':id')
  @ApiOperation({ summary: 'Ofis adı ve iletişim bilgilerini günceller' })
  update(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string, @Body() dto: UpdateOfficeDto) {
    return this.offices.update(user.id, id, dto);
  }

  @Roles('agent')
  @Post(':id/requests/:membershipId/approve')
  @HttpCode(200)
  @ApiOperation({ summary: 'Katılma talebini onaylar (başka ofisteyse transfer olur)' })
  approve(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Param('membershipId', uuid) membershipId: string,
  ) {
    return this.offices.approveRequest(user.id, id, membershipId);
  }

  @Roles('agent')
  @Post(':id/requests/:membershipId/decline')
  @HttpCode(200)
  @ApiOperation({ summary: 'Katılma talebini reddeder' })
  decline(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Param('membershipId', uuid) membershipId: string,
  ) {
    return this.offices.declineRequest(user.id, id, membershipId);
  }

  @Roles('agent')
  @Post(':id/invitations')
  @ApiOperation({ summary: 'Onaylı bir danışmanı telefon numarasıyla davet eder' })
  invite(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string, @Body() dto: InviteDto) {
    return this.offices.invite(user.id, id, dto.phone);
  }

  @Roles('agent')
  @Delete(':id/invitations/:membershipId')
  @ApiOperation({ summary: 'Bekleyen daveti geri çeker' })
  cancelInvitation(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Param('membershipId', uuid) membershipId: string,
  ) {
    return this.offices.cancelInvitation(user.id, id, membershipId);
  }

  @Roles('agent')
  @Patch(':id/members/:userId')
  @ApiOperation({ summary: 'Üyenin rolünü değiştirir (yalnızca sahip)' })
  changeRole(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Param('userId', uuid) userId: string,
    @Body() dto: ChangeRoleDto,
  ) {
    return this.offices.changeRole(user.id, id, userId, dto.role);
  }

  @Roles('agent')
  @Delete(':id/members/:userId')
  @ApiOperation({ summary: 'Üyeyi ofisten çıkarır' })
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Param('userId', uuid) userId: string,
  ) {
    return this.offices.removeMember(user.id, id, userId);
  }

  @Roles('agent')
  @Post(':id/owner/:userId')
  @HttpCode(200)
  @ApiOperation({ summary: 'Ofis sahipliğini bir üyeye devreder' })
  transferOwnership(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Param('userId', uuid) userId: string,
  ) {
    return this.offices.transferOwnership(user.id, id, userId);
  }
}

/** Danışmanın kendi ofis durumu: üyelik, talepler, davetler */
@ApiTags('offices')
@ApiBearerAuth()
@Roles('agent')
@Controller('me/office')
export class MyOfficeController {
  constructor(private readonly offices: OfficesService) {}

  @Get()
  @ApiOperation({ summary: 'Ofis üyeliğim, açık taleplerim ve gelen davetler' })
  mine(@CurrentUser() user: AuthUser) {
    return this.offices.mine(user.id);
  }

  @Delete('requests/:membershipId')
  @ApiOperation({ summary: 'Katılma talebimi geri çeker' })
  cancelRequest(@CurrentUser() user: AuthUser, @Param('membershipId', uuid) id: string) {
    return this.offices.cancelRequest(user.id, id);
  }

  @Post('invitations/:membershipId/accept')
  @HttpCode(200)
  @ApiOperation({ summary: 'Daveti kabul eder (başka ofisteysem transfer olur)' })
  accept(@CurrentUser() user: AuthUser, @Param('membershipId', uuid) id: string) {
    return this.offices.acceptInvitation(user.id, id);
  }

  @Post('invitations/:membershipId/decline')
  @HttpCode(200)
  @ApiOperation({ summary: 'Daveti reddeder' })
  decline(@CurrentUser() user: AuthUser, @Param('membershipId', uuid) id: string) {
    return this.offices.declineInvitation(user.id, id);
  }

  @Post('leave')
  @HttpCode(200)
  @ApiOperation({ summary: 'Ofisten ayrılır; Bağımsız Danışman olur' })
  leave(@CurrentUser() user: AuthUser) {
    return this.offices.leave(user.id);
  }
}

/** Yönetici (admin) ofis incelemesi */
@ApiTags('admin')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin/offices')
export class AdminOfficesController {
  constructor(private readonly offices: OfficesService) {}

  @Get()
  @ApiOperation({ summary: 'Ofis başvurularını duruma göre listeler' })
  list(@Query() q: ListOfficesQuery) {
    return this.offices.adminList(q.status ?? 'pending', q.limit ?? 20, q.offset ?? 0);
  }

  @Get('counts')
  @ApiOperation({ summary: 'Durum başına ofis sayıları' })
  counts() {
    return this.offices.adminCounts();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Ofis başvuru detayı; sahibin danışman doğrulamasıyla birlikte' })
  detail(@Param('id', uuid) id: string) {
    return this.offices.adminDetail(id);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @ApiOperation({ summary: 'Ofisi onaylar' })
  approve(@CurrentUser() admin: AuthUser, @Param('id', uuid) id: string) {
    return this.offices.adminApprove(admin.id, id);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @ApiOperation({ summary: 'Ofisi gerekçeyle reddeder' })
  reject(@CurrentUser() admin: AuthUser, @Param('id', uuid) id: string, @Body() dto: RejectDto) {
    return this.offices.adminReject(admin.id, id, dto.reason);
  }
}
