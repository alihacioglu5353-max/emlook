import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import {
  verificationStatus,
  type VerificationStatus,
} from '../db/schema.js';

export class ListVerificationsQuery {
  @ApiPropertyOptional({ enum: [...verificationStatus.enumValues, 'all'], default: 'pending' })
  @IsOptional()
  @IsIn([...verificationStatus.enumValues, 'all'])
  status?: VerificationStatus | 'all';

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

export class RejectDto {
  @ApiProperty({ example: 'Yetki belgesi okunmuyor, lütfen net bir kopya yükleyin' })
  @IsString()
  @Length(5, 500)
  reason!: string;
}
