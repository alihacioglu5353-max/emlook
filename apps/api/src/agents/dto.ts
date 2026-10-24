import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

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
  @ApiProperty({ description: 'Evrak türü anahtarı (GET /agents/document-types)', example: 'authority_certificate' })
  @IsString()
  @Matches(/^[a-z0-9_]{2,40}$/)
  type!: string;
}
