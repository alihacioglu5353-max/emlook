import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { dealType, interestStatus, type DealType, type InterestStatus } from '../db/schema.js';

export class DiscoverQuery {
  @ApiPropertyOptional({ enum: dealType.enumValues })
  @IsOptional()
  @IsIn(dealType.enumValues)
  dealType?: DealType;

  @ApiPropertyOptional({ example: '34' })
  @IsOptional()
  @Matches(/^\d{2}$/)
  cityCode?: string;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  limit?: number;
}

export class SwipeDto {
  @ApiProperty({ enum: ['like', 'pass'] })
  @IsIn(['like', 'pass'])
  decision!: 'like' | 'pass';

  @ApiPropertyOptional({ description: 'Beğenide ilan sahibine iletilecek kısa not' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class InterestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class InterestListQuery {
  @ApiPropertyOptional({ enum: interestStatus.enumValues })
  @IsOptional()
  @IsIn(interestStatus.enumValues)
  status?: InterestStatus;
}
