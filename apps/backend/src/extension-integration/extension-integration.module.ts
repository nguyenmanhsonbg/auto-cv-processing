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
import { ExtensionFacebookController } from './extension-facebook.controller';
import { ExtensionIdempotencyService } from './extension-idempotency.service';
import { ExtensionIntegrationController } from './extension-integration.controller';
import { ExtensionIntegrationService } from './extension-integration.service';
import { ExtensionInstancesController } from './extension-instances.controller';
import { ExtensionInstancesService } from './extension-instances.service';
import { ExtensionTasksController } from './extension-tasks.controller';
import { ExtensionTasksService } from './extension-tasks.service';
import { QuestionsModule } from '../questions/questions.module';
import { CategoriesModule } from '../categories/categories.module';
import { ApplicationsModule } from '../applications/applications.module';

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
  ],
  providers: [
    ExtensionIntegrationService,
    ExtensionIdempotencyService,
    ExtensionInstancesService,
    ExtensionTasksService,
  ],
  exports: [
    ExtensionIntegrationService,
    ExtensionIdempotencyService,
    ExtensionInstancesService,
    ExtensionTasksService,
  ],
})
export class ExtensionIntegrationModule {}
