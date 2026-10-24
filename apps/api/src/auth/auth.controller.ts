import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  type AuthUser,
  Client,
  type ClientInfo,
  CurrentUser,
  Public,
} from '../common/auth.decorators.js';
import { AuthService } from './auth.service.js';
import { RefreshDto, RequestOtpDto, VerifyOtpDto } from './dto.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('otp/request')
  @HttpCode(200)
  @ApiOperation({ summary: 'Telefona tek kullanımlık giriş kodu gönderir' })
  requestOtp(@Body() dto: RequestOtpDto) {
    return this.auth.requestOtp(dto.phone);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('otp/verify')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Kodu doğrular; giriş yapar veya yeni hesap açar',
  })
  verifyOtp(@Body() dto: VerifyOtpDto, @Client() client: ClientInfo) {
    return this.auth.verifyOtp(dto.phone, dto.code, client);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Yenileme belirteciyle yeni belirteç çifti alır' })
  refresh(@Body() dto: RefreshDto, @Client() client: ClientInfo) {
    return this.auth.refresh(dto.refreshToken, client);
  }

  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Geçerli oturumu kapatır' })
  async logout(@CurrentUser() user: AuthUser) {
    await this.auth.logout(user.sessionId);
  }
}
