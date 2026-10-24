import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { dealType, type DealType } from '../db/schema.js';

export class PageQuery {
  @ApiPropertyOptional({ description: 'Önceki sayfanın nextCursor değeri' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class FeedQuery extends PageQuery {
  @ApiPropertyOptional({ enum: ['all', 'network'], default: 'all', description: 'all = Emlook Ağı, network = Benim Ağım' })
  @IsOptional()
  @IsIn(['all', 'network'])
  scope?: 'all' | 'network';

  @ApiPropertyOptional({ enum: dealType.enumValues })
  @IsOptional()
  @IsIn(dealType.enumValues)
  dealType?: DealType;
}
