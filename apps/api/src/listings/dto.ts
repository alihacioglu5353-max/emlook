import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  dealType,
  listingCategory,
  listingStatus,
  listingVisibility,
  type DealType,
  type ListingCategory,
  type ListingStatus,
  type ListingVisibility,
} from '../db/schema.js';

export class CreateListingDto {
  @ApiProperty({ enum: dealType.enumValues })
  @IsIn(dealType.enumValues)
  dealType!: DealType;

  @ApiProperty({ enum: listingCategory.enumValues })
  @IsIn(listingCategory.enumValues)
  category!: ListingCategory;

  @ApiProperty({ example: 'Moda sahile yürüme mesafesinde 3+1' })
  @IsString()
  @Length(5, 120)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiProperty({ example: 12500000, description: 'TL, tam sayı' })
  @IsInt()
  @Min(1)
  @Max(1_000_000_000_000)
  price!: number;

  @ApiPropertyOptional({ example: 145 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000_000)
  grossM2?: number;

  @ApiPropertyOptional({ example: 120 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000_000)
  netM2?: number;

  @ApiPropertyOptional({ example: '3+1' })
  @IsOptional()
  @IsString()
  @Matches(/^(\d{1,2}(\+\d{1,2})?|Stüdyo)$/, { message: 'Oda sayısı "3+1" biçiminde olmalı' })
  rooms?: string;

  @ApiPropertyOptional({ example: '4' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  floor?: string;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(300)
  buildingAge?: number;

  @ApiProperty({ example: '34' })
  @IsString()
  @Matches(/^\d{2}$/)
  cityCode!: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  districtId!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  neighbourhoodId?: number;

  @ApiProperty({ example: 50, description: 'Alıcı tarafındaki danışmanın komisyon payı (%)' })
  @IsInt()
  @Min(0)
  @Max(100)
  cobrokeShare!: number;

  @ApiPropertyOptional({ enum: listingVisibility.enumValues, default: 'public' })
  @IsOptional()
  @IsIn(listingVisibility.enumValues)
  visibility?: ListingVisibility;

  @ApiPropertyOptional({ description: 'Lansman öncesi test ilanı' })
  @IsOptional()
  @IsBoolean()
  isDemo?: boolean;

  @ApiPropertyOptional({ description: 'EİDS taşınmaz numarası' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{5,20}$/, { message: 'Taşınmaz numarası 5-20 haneli rakamlardan oluşmalı' })
  propertyNumber?: string;
}

export class UpdateListingDto extends PartialType(CreateListingDto) {}

export class ReorderPhotosDto {
  @ApiProperty({ type: [String], description: 'Yeni sırayla fotoğraf kimlikleri (ilk = kapak)' })
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  ids!: string[];
}

export class MyListingsQuery {
  @ApiPropertyOptional({ enum: listingStatus.enumValues })
  @IsOptional()
  @IsIn(listingStatus.enumValues)
  status?: ListingStatus;

  @ApiPropertyOptional({ enum: dealType.enumValues })
  @IsOptional()
  @IsIn(dealType.enumValues)
  dealType?: DealType;

  @ApiPropertyOptional({ default: 30 })
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
