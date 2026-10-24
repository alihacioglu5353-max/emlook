import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { dealType, listingCategory, type DealType, type ListingCategory } from '../db/schema.js';

const int = () => Type(() => Number);

export class SearchQuery {
  @ApiPropertyOptional({ example: 'kadıköy satılık 3+1 10 milyon altı' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @ApiPropertyOptional({ enum: dealType.enumValues })
  @IsOptional()
  @IsIn(dealType.enumValues)
  dealType?: DealType;

  @ApiPropertyOptional({ enum: listingCategory.enumValues })
  @IsOptional()
  @IsIn(listingCategory.enumValues)
  category?: ListingCategory;

  @ApiPropertyOptional({ example: '3+1' })
  @IsOptional()
  @Matches(/^(\d{1,2}(\+\d{1,2})?|Stüdyo)$/)
  rooms?: string;

  @ApiPropertyOptional() @IsOptional() @int() @IsInt() @Min(0) minPrice?: number;
  @ApiPropertyOptional() @IsOptional() @int() @IsInt() @Min(0) maxPrice?: number;
  @ApiPropertyOptional() @IsOptional() @int() @IsInt() @Min(0) minM2?: number;
  @ApiPropertyOptional() @IsOptional() @int() @IsInt() @Min(0) maxM2?: number;

  @ApiPropertyOptional({ example: '34' })
  @IsOptional()
  @Matches(/^\d{2}$/)
  cityCode?: string;

  @ApiPropertyOptional() @IsOptional() @int() @IsInt() @Min(1) districtId?: number;
  @ApiPropertyOptional() @IsOptional() @int() @IsInt() @Min(1) neighbourhoodId?: number;

  @ApiPropertyOptional({ enum: ['new', 'price_asc', 'price_desc'], default: 'new' })
  @IsOptional()
  @IsIn(['new', 'price_asc', 'price_desc'])
  sort?: 'new' | 'price_asc' | 'price_desc';

  @ApiPropertyOptional({ description: 'Kendi ilanlarımı hariç tut' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  excludeMine?: boolean;

  @ApiPropertyOptional({ default: 20 }) @IsOptional() @int() @IsInt() @Min(1) @Max(50) limit?: number;
  @ApiPropertyOptional({ default: 0 }) @IsOptional() @int() @IsInt() @Min(0) @Max(10_000) offset?: number;
}

export class AgentSearchQuery {
  @ApiPropertyOptional()
  @IsString()
  @MaxLength(100)
  q!: string;
}
