import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  type RawBodyRequest,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { type AuthUser, CurrentUser, Public, Roles } from '../common/auth.decorators.js';
import { CreatePaymentRequestDto, MockCompleteDto, PaymentListQuery, PayoutAccountDto } from './dto.js';
import { PaymentsService } from './payments.service.js';
import { MockPaymentProvider, PaymentProvider } from './provider.js';

const uuid = new ParseUUIDPipe();

@ApiTags('payments')
@ApiBearerAuth()
@Roles('agent')
@Controller()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get('me/payout-account')
  @ApiOperation({ summary: 'Ödeme alacağım hesap (IBAN maskeli)' })
  async account(@CurrentUser() user: AuthUser) {
    return { account: await this.payments.payoutAccount(user.id) };
  }

  @Put('me/payout-account')
  @ApiOperation({ summary: 'IBAN hesabını kaydet / güncelle (alt üye işyeri)' })
  async saveAccount(@CurrentUser() user: AuthUser, @Body() dto: PayoutAccountDto) {
    return { account: await this.payments.upsertPayoutAccount(user.id, dto) };
  }

  @Get('payments/summary')
  @ApiOperation({ summary: 'Kazanç özeti (kuruş)' })
  summary(@CurrentUser() user: AuthUser) {
    return this.payments.summary(user.id);
  }

  @Post('payments/requests')
  @ApiOperation({ summary: 'Komisyon ödeme talebi ve bağlantısı oluştur' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePaymentRequestDto) {
    return this.payments.create(user.id, dto);
  }

  @Get('payments/requests')
  list(@CurrentUser() user: AuthUser, @Query() q: PaymentListQuery) {
    return this.payments.list(user.id, q);
  }

  @Get('payments/requests/:id')
  detail(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.payments.detail(user.id, id);
  }

  @Post('payments/requests/:id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.payments.cancel(user.id, id);
  }
}

/** Oturum gerektirmeyen uçlar: ödeme sayfası ve sağlayıcı bildirimi */
@ApiTags('pay')
@Public()
@Controller()
export class PublicPayController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly provider: PaymentProvider,
  ) {}

  @Get('pay/:token')
  @ApiOperation({ summary: 'Ödeme sayfası bilgisi' })
  view(@Param('token') token: string) {
    return this.payments.publicView(token);
  }

  @Post('pay/:token/checkout')
  @HttpCode(200)
  @ApiOperation({ summary: 'Ödeme oturumu başlat; sağlayıcı sayfasına yönlendirme adresi döner' })
  checkout(@Param('token') token: string) {
    return this.payments.checkout(token);
  }

  @Post('pay/:token/mock-complete')
  @HttpCode(200)
  @ApiOperation({ summary: 'Yalnızca test sağlayıcısı: ödemeyi tamamla / başarısız say' })
  async mockComplete(@Param('token') token: string, @Body() dto: MockCompleteDto) {
    if (!(this.provider instanceof MockPaymentProvider)) throw new ForbiddenException();
    await this.payments.publicView(token);
    const { body, signature } = this.provider.buildEvent(dto.sessionId, dto.outcome);
    return this.payments.handleWebhook(this.provider.name, body, { 'x-emlook-signature': signature });
  }

  @Post('payments/webhook/:provider')
  @HttpCode(200)
  @ApiOperation({ summary: 'Ödeme sağlayıcısı bildirimi (imzalı)' })
  webhook(
    @Param('provider') provider: string,
    @Req() req: RawBodyRequest<Request>,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    return this.payments.handleWebhook(provider, req.rawBody, headers);
  }
}
