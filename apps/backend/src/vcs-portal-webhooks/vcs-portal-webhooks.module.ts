import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApplicationsModule } from '../applications/applications.module';
import { CvDocumentsModule } from '../cv-documents/cv-documents.module';
import { CvParsingModule } from '../cv-parsing/cv-parsing.module';
import { FormSessionsModule } from '../form-sessions/form-sessions.module';
import { JobDescriptionEntity } from '../job-descriptions/entities/job-description.entity';
import { JobPostingEntity } from '../job-postings/entities/job-posting.entity';
import { VcsPortalApplyWebhookController } from './vcs-portal-apply-webhook.controller';
import { VcsPortalApplyWebhookService } from './vcs-portal-apply-webhook.service';

@Module({
  imports: [
    ApplicationsModule,
    CvDocumentsModule,
    CvParsingModule,
    FormSessionsModule,
    TypeOrmModule.forFeature([
      JobDescriptionEntity,
      JobPostingEntity,
    ]),
  ],
  controllers: [VcsPortalApplyWebhookController],
  providers: [VcsPortalApplyWebhookService],
})
export class VcsPortalWebhooksModule {}
