import { Body, Controller, Delete, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsIn, IsString, Length } from 'class-validator';
import { type AuthUser, CurrentUser } from '../common/auth.decorators.js';
import { devicePlatform, type DevicePlatform } from '../db/schema.js';
import { PushService } from './push.service.js';

export class RegisterDeviceDto {
  @ApiProperty({ description: 'FCM kayıt belirteci' })
  @IsString()
  @Length(10, 4096)
  token!: string;

  @ApiProperty({ enum: devicePlatform.enumValues })
  @IsIn(devicePlatform.enumValues)
  platform!: DevicePlatform;
}

@ApiTags('devices')
@ApiBearerAuth()
@Controller('me/devices')
export class DevicesController {
  constructor(private readonly push: PushService) {}

  @Post()
  @HttpCode(204)
  @ApiOperation({ summary: 'Push bildirimi için cihaz kaydı' })
  async register(@CurrentUser() user: AuthUser, @Body() dto: RegisterDeviceDto) {
    await this.push.register(user.id, dto.token, dto.platform);
  }

  @Delete(':token')
  @HttpCode(204)
  @ApiOperation({ summary: 'Cihaz kaydını sil (çıkışta)' })
  async unregister(@CurrentUser() user: AuthUser, @Param('token') token: string) {
    await this.push.unregister(user.id, token);
  }
}
