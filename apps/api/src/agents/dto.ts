import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { documentType, type DocumentType } from '../db/schema.js';

export class UpdateAgentProfileDto {
  @ApiPropertyOptional({ description: 'Taşınmaz Ticareti Yetki Belgesi no' })
  @IsOptional()
  @IsString()
  @Length(3, 40)
  licenseNumber?: string;

  @ApiPropertyOptional({ example: 'Yılmaz Gayrimenkul Ltd. Şti.' })
  @IsOptional()
  @IsString()
  @Length(2, 160)
  businessName?: string;

  @ApiPropertyOptional({ example: 'İstanbul' })
  @IsOptional()
  @IsString()
  @Length(2, 40)
  city?: string;

  @ApiPropertyOptional({ example: 'Kadıköy' })
  @IsOptional()
  @IsString()
  @Length(2, 60)
  district?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(600)
  bio?: string;
}

export class UploadDocumentDto {
  @ApiProperty({ enum: documentType.enumValues })
  @IsIn(documentType.enumValues)
  type!: DocumentType;
}
