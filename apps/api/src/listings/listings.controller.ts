import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MAX_UPLOAD_BYTES } from '../agents/agents.controller.js';
import { type AuthUser, CurrentUser, Roles } from '../common/auth.decorators.js';
import { CreateListingDto, MyListingsQuery, ReorderPhotosDto, UpdateListingDto } from './dto.js';
import { ListingsService } from './listings.service.js';

const uuid = new ParseUUIDPipe();

@ApiTags('listings')
@ApiBearerAuth()
@Controller('listings')
export class ListingsController {
  constructor(private readonly listings: ListingsService) {}

  @Roles('agent')
  @Get('mine')
  @ApiOperation({ summary: 'Portföylerim: duruma ve ilan tipine göre, sayılarla' })
  mine(@CurrentUser() user: AuthUser, @Query() q: MyListingsQuery) {
    return this.listings.mine(user.id, q);
  }

  @Roles('agent')
  @Post()
  @ApiOperation({ summary: 'Taslak ilan oluşturur (onaylı danışman)' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateListingDto) {
    return this.listings.create(user.id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'İlan detayı (görünürlük kurallarına göre)' })
  detail(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.listings.detail(id, { id: user.id, role: user.role });
  }

  @Roles('agent')
  @Patch(':id')
  @ApiOperation({ summary: 'İlanı günceller' })
  update(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string, @Body() dto: UpdateListingDto) {
    return this.listings.update(user.id, id, dto);
  }

  @Roles('agent')
  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Taslak ilanı siler' })
  async remove(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    await this.listings.remove(user.id, id);
  }

  @Roles('agent')
  @Post(':id/photos')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiOperation({ summary: 'Fotoğraf ekler (JPG, PNG, WebP)' })
  addPhoto(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.listings.addPhoto(user.id, id, file);
  }

  @Roles('agent')
  @Put(':id/photos/order')
  @ApiOperation({ summary: 'Fotoğraf sırasını değiştirir (ilk = kapak)' })
  reorder(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string, @Body() dto: ReorderPhotosDto) {
    return this.listings.reorderPhotos(user.id, id, dto.ids);
  }

  @Roles('agent')
  @Delete(':id/photos/:photoId')
  @ApiOperation({ summary: 'Fotoğrafı kaldırır' })
  removePhoto(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Param('photoId', uuid) photoId: string,
  ) {
    return this.listings.removePhoto(user.id, id, photoId);
  }

  @Get(':id/photos/:photoId')
  @ApiOperation({ summary: 'Fotoğraf dosyası' })
  photo(
    @CurrentUser() user: AuthUser,
    @Param('id', uuid) id: string,
    @Param('photoId', uuid) photoId: string,
  ) {
    return this.listings.streamPhoto({ id: user.id, role: user.role }, id, photoId);
  }

  @Roles('agent')
  @Post(':id/eids-verify')
  @HttpCode(200)
  @ApiOperation({ summary: 'Taşınmaz numarasıyla EİDS yetki doğrulaması yapar' })
  verify(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.listings.verifyEids(user.id, id);
  }

  @Roles('agent')
  @Post(':id/publish')
  @HttpCode(200)
  @ApiOperation({ summary: 'Yayına alır (EİDS onayı veya deneme ilanı + en az 1 fotoğraf)' })
  publish(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.listings.publish(user.id, id);
  }

  @Roles('agent')
  @Post(':id/deactivate')
  @HttpCode(200)
  @ApiOperation({ summary: 'Pasife alır' })
  deactivate(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.listings.setStatus(user.id, id, 'passive');
  }

  @Roles('agent')
  @Post(':id/sold')
  @HttpCode(200)
  @ApiOperation({ summary: 'Satıldı / kiralandı olarak işaretler' })
  sold(@CurrentUser() user: AuthUser, @Param('id', uuid) id: string) {
    return this.listings.setStatus(user.id, id, 'sold');
  }
}
