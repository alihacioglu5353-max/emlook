import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, Min } from 'class-validator';
import { paymentStatus, type PaymentStatus } from '../db/schema.js';

export class PayoutAccountDto {
  @ApiProperty({ example: 'Ayşe Yılmaz' })
  @IsString()
  @Length(3, 120)
  holderName!: string;

  @ApiProperty({ example: 'TR33 0006 1005 1978 6457 8413 26' })
  @IsString()
  @Length(26, 40)
  iban!: string;

  @ApiProperty({ description: 'TCKN (11) veya VKN (10)' })
  @Matches(/^\d{10,11}$/, { message: 'TCKN 11, VKN 10 haneli olmalı' })
  taxId!: string;
}

export class CreatePaymentRequestDto {
  @ApiProperty({ description: 'Kuruş cinsinden (100.000 TL = 10000000)', example: 10_000_000 })
  @IsInt()
  @Min(100)
  @Max(10_000_000_000)
  amount!: number;

  @ApiProperty({ example: 'Moda 3+1 satış komisyonu' })
  @IsString()
  @Length(3, 200)
  description!: string;

  @ApiProperty({ example: 'Can Alıcı' })
  @IsString()
  @Length(2, 120)
  payerName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^0?5\d{9}$/, { message: 'Telefon 05XX XXX XX XX biçiminde olmalı' })
  payerPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail({}, { message: 'Geçerli bir e-posta girin' })
  payerEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  listingId?: string;

  @ApiPropertyOptional({ description: 'Paylaşımlı işlemde alıcı tarafındaki danışman' })
  @IsOptional()
  @IsUUID()
  buyerAgentId?: string;

  @ApiPropertyOptional({ description: 'Alıcı danışman payı (%); verilmezse ilandaki oran' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  buyerShare?: number;
}

export class PaymentListQuery {
  @ApiPropertyOptional({ enum: paymentStatus.enumValues })
  @IsOptional()
  @IsIn(paymentStatus.enumValues)
  status?: PaymentStatus;
}

export class MockCompleteDto {
  @ApiProperty()
  @IsString()
  @Length(5, 100)
  sessionId!: string;

  @ApiProperty({ enum: ['success', 'fail'] })
  @IsIn(['success', 'fail'])
  outcome!: 'success' | 'fail';
}
