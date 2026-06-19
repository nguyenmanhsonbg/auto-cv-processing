import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SessionEntity } from '../sessions/entities/session.entity';
import { NotificationService } from './notification.service';
import { SchedulerService } from './scheduler.service';

@Module({
  imports: [TypeOrmModule.forFeature([SessionEntity])],
  providers: [NotificationService, SchedulerService],
  exports: [NotificationService],
})
export class NotificationModule {}
