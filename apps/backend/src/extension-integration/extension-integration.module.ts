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
import { ExtensionTasksController } from './extension-tasks.controller';
import { ExtensionTasksService } from './extension-tasks.service';
import { ExtensionVcsPortalController } from './extension-vcs-portal.controller';
import { QuestionsModule } from '../questions/questions.module';
import { CategoriesModule } from '../categories/categories.module';
import { ApplicationsModule } from '../applications/applications.module';
import { VcsPortalClientService } from './vcs-portal-client.service';
import { VcsPortalJdMapper } from './vcs-portal-jd.mapper';
import { VcsPortalJdSyncService } from './vcs-portal-jd-sync.service';

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
  ],
  controllers: [
    ExtensionIntegrationController,
    ExtensionFacebookController,
    ExtensionInstancesController,
    ExtensionTasksController,
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
