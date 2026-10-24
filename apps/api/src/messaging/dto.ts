import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min } from 'class-validator';

export class StartConversationDto {
  @ApiProperty({ description: 'Mesaj gönderilecek kullanıcı' })
  @IsUUID()
  userId!: string;

  @ApiPropertyOptional({ description: 'Konuşmaya eklenecek ilan bağlamı' })
  @IsOptional()
  @IsUUID()
  listingId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 4000)
  text?: string;
}

export class SendMessageDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 4000)
  text?: string;

  @ApiPropertyOptional({ description: 'İlan kartı paylaş' })
  @IsOptional()
  @IsUUID()
  listingId?: string;
}

export class MessagesQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;

  @ApiPropertyOptional({ default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ description: 'Bu iletiden sonrakiler (yoklama)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  after?: string;
}
