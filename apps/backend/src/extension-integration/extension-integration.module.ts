import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FacebookPublishingModule } from '../facebook-publishing/facebook-publishing.module';
import {
  AmisCareerEntity,
  ExtensionIdempotencyRecordEntity,
  ExtensionInstanceEntity,
  ExtensionTaskEntity,
  ExtensionTaskEventEntity,
  RecruitmentExternalReferenceEntity,
  AmisHrMappingEntity,
  AmisApplicationStageReminderEntity,
  AmisRecruitmentRoundEntity,
} from './entities';
import { AuditLogEntity } from '../audit-logs/entities/audit-log.entity';
import { UserEntity } from '../auth/entities/user.entity';
import { JobDescriptionEntity } from '../job-descriptions/entities/job-description.entity';
import { JobSourceCategoryEntity } from '../job-descriptions/entities/job-source-category.entity';
import { QuestionSetEntity } from '../questions/entities/question-set.entity';
import { QuestionSetItemEntity } from '../questions/entities/question-set-item.entity';
import { ExtensionFacebookController } from './extension-facebook.controller';
import { ExtensionIdempotencyService } from './extension-idempotency.service';
import { ExtensionIntegrationController } from './extension-integration.controller';
import { ExtensionIntegrationService } from './extension-integration.service';
import { ExtensionInstancesController } from './extension-instances.controller';
import { ExtensionInstancesService } from './extension-instances.service';
import { ExtensionTasksService } from './extension-tasks.service';
import { ExtensionVcsPortalController } from './extension-vcs-portal.controller';
import { QuestionsModule } from '../questions/questions.module';
import { CategoriesModule } from '../categories/categories.module';
import { ApplicationsModule } from '../applications/applications.module';
import { FreelancersModule } from '../freelancers/freelancers.module';
import { InternalsModule } from '../internals/internals.module';
import { VcsPortalClientService } from './vcs-portal-client.service';
import { VcsPortalJdMapper } from './vcs-portal-jd.mapper';
import { VcsPortalJdSyncService } from './vcs-portal-jd-sync.service';
import { AmisRecruitmentRoundsService } from './amis-recruitment-rounds.service';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    FacebookPublishingModule,
    TypeOrmModule.forFeature([
      RecruitmentExternalReferenceEntity,
      ExtensionIdempotencyRecordEntity,
      AmisCareerEntity,
      ExtensionInstanceEntity,
      ExtensionTaskEntity,
      ExtensionTaskEventEntity,
      AmisHrMappingEntity,
      AmisApplicationStageReminderEntity,
      AmisRecruitmentRoundEntity,
      AuditLogEntity,
      UserEntity,
      JobDescriptionEntity,
      JobSourceCategoryEntity,
      QuestionSetEntity,
      QuestionSetItemEntity,
    ]),
    QuestionsModule,
    CategoriesModule,
    ApplicationsModule,
    FreelancersModule,
    InternalsModule,
    NotificationModule,
  ],
  controllers: [
    ExtensionIntegrationController,
    ExtensionFacebookController,
    ExtensionInstancesController,
    ExtensionVcsPortalController,
  ],
  providers: [
    ExtensionIntegrationService,
    ExtensionIdempotencyService,
    ExtensionInstancesService,
    ExtensionTasksService,
    VcsPortalClientService,
    VcsPortalJdMapper,
    VcsPortalJdSyncService,
    AmisRecruitmentRoundsService,
  ],
  exports: [
    ExtensionIntegrationService,
    ExtensionIdempotencyService,
    ExtensionInstancesService,
    ExtensionTasksService,
    VcsPortalJdSyncService,
  ],
})
export class ExtensionIntegrationModule {}
