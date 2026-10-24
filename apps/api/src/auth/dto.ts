import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

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

export class PasswordLoginDto {
  @ApiProperty({ example: 'ayse@ornek.com' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Geçerli bir e-posta adresi girin' })
  @MaxLength(254)
  email!: string;

  @ApiProperty()
  @IsString()
  @Length(1, 200)
  password!: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'ayse@ornek.com' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Geçerli bir e-posta adresi girin' })
  @MaxLength(254)
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  @Length(20, 200)
  token!: string;

  @ApiProperty({ description: 'En az 8 karakter, bir harf ve bir rakam' })
  @IsString()
  @Length(1, 200)
  password!: string;
}

export class ChangePasswordDto {
  @ApiProperty({ required: false, description: 'Parola daha önce belirlendiyse zorunlu' })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  currentPassword?: string;

  @ApiProperty()
  @IsString()
  @Length(1, 200)
  newPassword!: string;
}
