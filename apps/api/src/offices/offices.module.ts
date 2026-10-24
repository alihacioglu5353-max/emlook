import { Module } from '@nestjs/common';
import {
  AdminOfficesController,
  MyOfficeController,
  OfficesController,
} from './offices.controller.js';
import { OfficesService } from './offices.service.js';

@Module({
  // MyOfficeController önce: "me/office" yolları "offices/:id" ile karışmaz ama
  // açık sıralama okunabilirliği artırır.
  controllers: [MyOfficeController, OfficesController, AdminOfficesController],
  providers: [OfficesService],
  exports: [OfficesService],
})
export class OfficesModule {}
