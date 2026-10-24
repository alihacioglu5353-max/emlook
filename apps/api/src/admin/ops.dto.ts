import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';
import {
  eidsStatus,
  listingStatus,
  paymentStatus,
  reportReason,
  reportStatus,
  userRole,
  userStatus,
  type EidsStatus,
  type ListingStatus,
  type PaymentStatus,
  type ReportReason,
  type UserRole,
} from '../db/schema.js';

class Paged {
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

export class AdminUsersQuery extends Paged {
  @ApiPropertyOptional({ description: 'Ad veya telefon' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ enum: userRole.enumValues })
  @IsOptional()
  @IsIn(userRole.enumValues)
  role?: UserRole;

  @ApiPropertyOptional({ enum: userStatus.enumValues })
  @IsOptional()
  @IsIn(userStatus.enumValues)
  status?: 'active' | 'suspended';
}

export class AdminListingsQuery extends Paged {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ enum: listingStatus.enumValues })
  @IsOptional()
  @IsIn(listingStatus.enumValues)
  status?: ListingStatus;

  @ApiPropertyOptional({ enum: eidsStatus.enumValues })
  @IsOptional()
  @IsIn(eidsStatus.enumValues)
  eids?: EidsStatus;
}

export class ReasonDto {
  @ApiProperty()
  @IsString()
  @Length(5, 500)
  reason!: string;
}

export class EidsDecisionDto {
  @ApiProperty({ enum: ['verified', 'failed'] })
  @IsIn(['verified', 'failed'])
  decision!: 'verified' | 'failed';

  @ApiPropertyOptional({ description: 'Danışmana gösterilecek açıklama / EİDS referansı' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  message?: string;
}

export class ReportsQuery extends Paged {
  @ApiPropertyOptional({ enum: [...reportStatus.enumValues, 'all'], default: 'open' })
  @IsOptional()
  @IsIn([...reportStatus.enumValues, 'all'])
  status?: 'open' | 'resolved' | 'dismissed' | 'all';
}

export class DismissDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class AdminPaymentsQuery extends Paged {
  @ApiPropertyOptional({ enum: paymentStatus.enumValues })
  @IsOptional()
  @IsIn(paymentStatus.enumValues)
  status?: PaymentStatus;
}

export class ReportListingDto {
  @ApiProperty({ enum: reportReason.enumValues })
  @IsIn(reportReason.enumValues)
  reason!: ReportReason;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
