import { Module } from '@nestjs/common';
import { AvatarController, AvatarService } from './avatar.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  controllers: [UsersController, AvatarController],
  providers: [UsersService, AvatarService],
  exports: [UsersService],
})
export class UsersModule {}
