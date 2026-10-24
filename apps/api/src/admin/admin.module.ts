import { Module } from '@nestjs/common';
import { AgentsModule } from '../agents/agents.module.js';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';

@Module({
  imports: [AgentsModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
