import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { type AuthUser, CurrentUser, Public, Roles } from '../common/auth.decorators.js';
import { AgentsService } from './agents.service.js';
import { UpdateAgentProfileDto, UploadDocumentDto } from './dto.js';

export const MAX_UPLOAD_BYTES =
  Number(process.env.MAX_UPLOAD_MB ?? 10) * 1024 * 1024;

@ApiTags('agents')
@ApiBearerAuth()
@Controller('agents')
export class AgentsController {
  constructor(private readonly agents: AgentsService) {}

  @Public()
  @Get('document-types')
  @ApiOperation({ summary: 'Onay için istenen evrak türleri (yönetici belirler)' })
  documentTypes() {
    return this.agents.documentTypes();
  }

  @Roles('agent')
  @Get('me/verification')
  @ApiOperation({ summary: 'Onay başvurusunun durumu, profil ve belgeler' })
  verification(@CurrentUser() user: AuthUser) {
    return this.agents.verification(user.id);
  }

  @Roles('agent')
  @Patch('me/profile')
  @ApiOperation({ summary: 'Yetki belgesi ve çalışma bölgesi bilgileri' })
  updateProfile(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateAgentProfileDto,
  ) {
    return this.agents.updateProfile(user.id, dto);
  }

  @Roles('agent')
  @Post('me/documents')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['type', 'file'],
      properties: {
        type: { type: 'string', example: 'authority_certificate' },
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiOperation({ summary: 'Doğrulama belgesi yükler (PDF, JPG, PNG, BMP, WEBP)' })
  upload(
    @CurrentUser() user: AuthUser,
    @Body() dto: UploadDocumentDto,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.agents.uploadDocument(user.id, dto.type, file);
  }

  @Roles('agent')
  @Get('me/documents/:id/file')
  @ApiOperation({ summary: 'Kendi yüklediği belgeyi görüntüler' })
  myDocument(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.agents.streamDocument(id, user.id);
  }

  @Roles('agent')
  @Delete('me/documents/:id')
  @ApiOperation({ summary: 'Belgeyi siler (yalnızca taslak/ret durumunda)' })
  deleteDocument(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.agents.deleteDocument(user.id, id);
  }

  @Roles('agent')
  @Post('me/submit')
  @ApiOperation({ summary: 'Başvuruyu incelemeye gönderir' })
  submit(@CurrentUser() user: AuthUser) {
    return this.agents.submit(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Danışman kartı (ad, unvan, bölge, onay rozeti)' })
  card(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.agents.publicCard(id, user.id);
  }
}
