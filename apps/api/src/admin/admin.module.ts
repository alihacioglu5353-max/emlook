import { Module } from '@nestjs/common';
import { AgentsModule } from '../agents/agents.module.js';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';
import { AdminOpsController, ReportController } from './ops.controller.js';
import { AdminOpsService } from './ops.service.js';
import { ListingsModule } from '../listings/listings.module.js';

@Module({
  imports: [AgentsModule, ListingsModule],
  controllers: [AdminController, AdminOpsController, ReportController],
  providers: [AdminService, AdminOpsService],
})
export class AdminModule {}
