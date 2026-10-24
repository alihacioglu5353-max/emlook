import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches, MaxLength } from 'class-validator';

export class RequestOtpDto {
  @ApiProperty({ example: '0532 123 45 67' })
  @IsString()
  @MaxLength(32)
  phone!: string;
}

export class VerifyOtpDto {
  @ApiProperty({ example: '05321234567' })
  @IsString()
  @MaxLength(32)
  phone!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: 'Kod 6 haneli olmalı' })
  code!: string;
}

export class RefreshDto {
  @ApiProperty()
  @IsString()
  @Length(20, 200)
  refreshToken!: string;
}
