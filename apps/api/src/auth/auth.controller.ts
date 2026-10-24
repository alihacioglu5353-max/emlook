import { Body, Controller, Get, HttpCode, Post, Put, Query } from '@nestjs/common';
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
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  PasswordLoginDto,
  RefreshDto,
  RequestOtpDto,
  ResetPasswordDto,
  VerifyOtpDto,
} from './dto.js';
import { PasswordService } from './password.service.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly passwords: PasswordService,
  ) {}

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
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('password/login')
  @HttpCode(200)
  @ApiOperation({ summary: 'E-posta ve parola ile giriş (5 hatalı denemede 15 dk kilit)' })
  passwordLogin(@Body() dto: PasswordLoginDto, @Client() client: ClientInfo) {
    return this.passwords.login(dto.email, dto.password, client);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('password/forgot')
  @HttpCode(200)
  @ApiOperation({ summary: 'Parola yenileme bağlantısı e-postalar (her durumda aynı yanıt)' })
  forgot(@Body() dto: ForgotPasswordDto, @Client() client: ClientInfo) {
    return this.passwords.forgot(dto.email, client);
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('password/reset')
  @ApiOperation({ summary: 'Yenileme bağlantısı geçerli mi' })
  checkReset(@Query('token') token: string) {
    return this.passwords.checkToken(token ?? '');
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('password/reset')
  @HttpCode(200)
  @ApiOperation({ summary: 'Bağlantıdaki belirteçle yeni parola belirler; tüm oturumlar kapanır' })
  reset(@Body() dto: ResetPasswordDto) {
    return this.passwords.reset(dto.token, dto.password);
  }

  @ApiBearerAuth()
  @Put('password')
  @ApiOperation({ summary: 'Parola belirler veya değiştirir; diğer oturumlar kapanır' })
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.passwords.change(user.id, user.sessionId, dto.newPassword, dto.currentPassword);
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
