import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { officeStatus, type OfficeStatus } from '../db/schema.js';

export class CreateOfficeDto {
  @ApiProperty({ example: 'Yılmaz Gayrimenkul Kadıköy' })
  @IsString()
  @Length(2, 80)
  name!: string;

  @ApiProperty({ example: 'Yılmaz Gayrimenkul Ltd. Şti.' })
  @IsString()
  @Length(2, 160)
  legalName!: string;

  @ApiProperty({ description: 'Taşınmaz Ticareti Yetki Belgesi no', example: '3400123' })
  @IsString()
  @Length(3, 40)
  licenseNumber!: string;

  @ApiProperty({ example: 'İstanbul' })
  @IsString()
  @Length(2, 40)
  city!: string;

  @ApiProperty({ example: 'Kadıköy' })
  @IsString()
  @Length(2, 60)
  district!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @ApiPropertyOptional({ example: '0216 123 45 67' })
  @IsOptional()
  @IsString()
  @Length(7, 32)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;
}

/** Onaydan sonra unvan ve belge numarası değiştirilemez; iletişim bilgileri güncellenebilir. */
export class UpdateOfficeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 80)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(7, 32)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;
}

export class SearchOfficesQuery {
  @ApiPropertyOptional({ description: 'Ofis adı veya unvanında arama' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  city?: string;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class InviteDto {
  @ApiProperty({ example: '0532 123 45 67', description: 'Davet edilecek danışmanın cep telefonu' })
  @IsString()
  @MaxLength(32)
  phone!: string;
}

export class ChangeRoleDto {
  @ApiProperty({ enum: ['manager', 'agent'] })
  @IsIn(['manager', 'agent'])
  role!: 'manager' | 'agent';
}

export class ListOfficesQuery {
  @ApiPropertyOptional({ enum: [...officeStatus.enumValues, 'all'], default: 'pending' })
  @IsOptional()
  @IsIn([...officeStatus.enumValues, 'all'])
  status?: OfficeStatus | 'all';

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
