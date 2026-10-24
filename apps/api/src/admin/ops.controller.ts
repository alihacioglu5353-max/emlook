import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type AuthUser, CurrentUser, Roles } from '../common/auth.decorators.js';
import {
  AdminListingsQuery,
  AdminPaymentsQuery,
  AdminUsersQuery,
  DismissDto,
  EidsDecisionDto,
  ReasonDto,
  ReportListingDto,
  ReportsQuery,
} from './ops.dto.js';
import { AdminOpsService } from './ops.service.js';

const uuid = new ParseUUIDPipe();

@ApiTags('admin')
@ApiBearerAuth()
@Roles('admin')
@Controller('admin')
export class AdminOpsController {
  constructor(private readonly ops: AdminOpsService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Yönetim paneli özeti' })
  dashboard() {
    return this.ops.dashboard();
  }

  @Get('dashboard/charts')
  @ApiOperation({ summary: 'Panel grafikleri: haftalık/aylık seriler, dağılımlar, son etkinlik' })
  charts() {
    return this.ops.charts();
  }

  @Get('users')
  users(@Query() q: AdminUsersQuery) {
    return this.ops.users(q);
  }

  @Get('users/:id')
  user(@Param('id', uuid) id: string) {
    return this.ops.user(id);
  }

  @Post('users/:id/suspend')
  @HttpCode(200)
  @ApiOperation({ summary: 'Hesabı askıya al (oturumlar kapanır)' })
  suspend(@CurrentUser() admin: AuthUser, @Param('id', uuid) id: string, @Body() dto: ReasonDto) {
    return this.ops.suspend(admin.id, id, dto.reason);
  }

  @Post('users/:id/reactivate')
  @HttpCode(200)
  reactivate(@CurrentUser() admin: AuthUser, @Param('id', uuid) id: string) {
    return this.ops.reactivate(admin.id, id);
  }

  @Get('listings')
  listings(@Query() q: AdminListingsQuery) {
    return this.ops.listingsList(q);
  }

  @Post('listings/:id/remove')
  @HttpCode(200)
  @ApiOperation({ summary: 'İlanı gerekçeyle yayından kaldır' })
  remove(@CurrentUser() admin: AuthUser, @Param('id', uuid) id: string, @Body() dto: ReasonDto) {
    return this.ops.removeListing(admin.id, id, dto.reason);
  }

  @Post('listings/:id/restore')
  @HttpCode(200)
  restore(@CurrentUser() admin: AuthUser, @Param('id', uuid) id: string) {
    return this.ops.restoreListing(admin.id, id);
  }

  @Post('listings/:id/eids')
  @HttpCode(200)
  @ApiOperation({ summary: 'EİDS yetkisini elle doğrula / reddet' })
  eids(@CurrentUser() admin: AuthUser, @Param('id', uuid) id: string, @Body() dto: EidsDecisionDto) {
    return this.ops.decideEids(admin.id, id, dto);
  }

  @Get('reports')
  reports(@Query() q: ReportsQuery) {
    return this.ops.reports(q);
  }

  @Post('reports/:id/dismiss')
  @HttpCode(200)
  dismiss(@CurrentUser() admin: AuthUser, @Param('id', uuid) id: string, @Body() dto: DismissDto) {
    return this.ops.dismissReport(admin.id, id, dto.note);
  }

  @Get('payments')
  payments(@Query() q: AdminPaymentsQuery) {
    return this.ops.payments(q);
  }
}

/** Kullanıcı tarafı: ilan şikâyeti */
@ApiTags('listings')
@ApiBearerAuth()
@Controller('listings')
export class ReportController {
  constructor(private readonly ops: AdminOpsService) {}

  @Post(':id/report')
  @ApiOperation({ summary: 'İlanı şikâyet et' })
  report(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string, @Body() dto: ReportListingDto) {
    return this.ops.report({ id: user.id, role: user.role }, id, dto);
  }
}
