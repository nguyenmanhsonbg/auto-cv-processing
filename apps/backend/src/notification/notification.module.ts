import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SessionEntity } from '../sessions/entities/session.entity';
import { NotificationService } from './notification.service';
import { SchedulerService } from './scheduler.service';
import { MailService } from './mail.service';
import { CvStageReminderService } from './cv-stage-reminder.service';
import { CandidateStageNotificationService } from './candidate-stage-notification.service';
import { ApplicationEntity } from '../applications/entities/application.entity';
import { UserEntity } from '../auth/entities/user.entity';
import {
  AmisApplicationStageReminderEntity,
  AmisHrMappingEntity,
} from '../extension-integration/entities';
import { AmisCandidateStageNotificationEntity } from './entities';

@Module({
  imports: [TypeOrmModule.forFeature([
    SessionEntity,
    ApplicationEntity,
    UserEntity,
    AmisApplicationStageReminderEntity,
    AmisHrMappingEntity,
    AmisCandidateStageNotificationEntity,
  ])],
  providers: [
    NotificationService,
    SchedulerService,
    MailService,
    CvStageReminderService,
    CandidateStageNotificationService,
  ],
  exports: [
    NotificationService,
    MailService,
    CvStageReminderService,
    CandidateStageNotificationService,
  ],
})
export class NotificationModule {}
