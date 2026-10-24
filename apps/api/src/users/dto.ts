import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Equals,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

export class OnboardingDto {
  @ApiProperty({ example: 'Ayşe Yılmaz' })
  @IsString()
  @Length(3, 80)
  fullName!: string;

  @ApiProperty({ enum: ['agent', 'consumer'] })
  @IsIn(['agent', 'consumer'])
  accountType!: 'agent' | 'consumer';

  @ApiPropertyOptional({ example: 'ayse@ornek.com' })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ApiProperty({ description: 'KVKK aydınlatma metni okundu (zorunlu)' })
  @Equals(true, { message: 'KVKK aydınlatma metnini onaylamanız gerekiyor' })
  kvkkClarification!: boolean;

  @ApiProperty({ description: 'Kullanım koşulları kabul edildi (zorunlu)' })
  @Equals(true, { message: 'Kullanım koşullarını kabul etmeniz gerekiyor' })
  termsOfUse!: boolean;

  @ApiPropertyOptional({ description: 'Ticari elektronik ileti izni' })
  @IsOptional()
  @IsBoolean()
  marketing?: boolean;
}

export class UpdateMeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(3, 80)
  fullName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;
}

export class MarketingConsentDto {
  @ApiProperty()
  @IsBoolean()
  granted!: boolean;
}
