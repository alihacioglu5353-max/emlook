import { Body, Controller, Get, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type AuthUser,
  Client,
  type ClientInfo,
  CurrentUser,
} from '../common/auth.decorators.js';
import { MarketingConsentDto, OnboardingDto, UpdateMeDto } from './dto.js';
import { UsersService } from './users.service.js';

@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Oturumdaki kullanıcı, rozet ve rıza durumu' })
  me(@CurrentUser() user: AuthUser) {
    return this.users.me(user.id);
  }

  @Post('onboarding')
  @ApiOperation({
    summary: 'Hesap tipini seçer, ad soyad ve zorunlu rızaları kaydeder',
  })
  onboard(
    @CurrentUser() user: AuthUser,
    @Body() dto: OnboardingDto,
    @Client() client: ClientInfo,
  ) {
    return this.users.onboard(user.id, dto, client);
  }

  @Patch()
  @ApiOperation({ summary: 'Ad soyad veya e-postayı günceller' })
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateMeDto) {
    return this.users.update(user.id, dto);
  }

  @Put('consents/marketing')
  @ApiOperation({ summary: 'Ticari ileti iznini verir veya geri alır' })
  marketing(
    @CurrentUser() user: AuthUser,
    @Body() dto: MarketingConsentDto,
    @Client() client: ClientInfo,
  ) {
    return this.users.setMarketingConsent(user.id, dto.granted, client);
  }
}
