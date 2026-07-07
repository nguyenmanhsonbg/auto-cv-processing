import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiScreeningResultEntity } from '../ai-screening/entities/ai-screening-result.entity';
import { ApplicationsModule } from '../applications/applications.module';
import { ApplicationEntity } from '../applications/entities/application.entity';
import { AuditLogEntity } from '../audit-logs/entities/audit-log.entity';
import { UserEntity } from '../auth/entities/user.entity';
import { CandidateEntity } from '../candidates/entities/candidate.entity';
import { CvDocumentsModule } from '../cv-documents/cv-documents.module';
import { CvParsingModule } from '../cv-parsing/cv-parsing.module';
import { CvDocumentEntity } from '../cv-documents/entities/cv-document.entity';
import { ParsedProfileEntity } from '../cv-documents/entities/parsed-profile.entity';
import { FormAnswerEntity } from '../form-sessions/entities/form-answer.entity';
import { FormSessionEntity } from '../form-sessions/entities/form-session.entity';
import { HrReviewDecisionEntity } from '../hr-review/entities/hr-review-decision.entity';
import { JobDescriptionEntity } from '../job-descriptions/entities/job-description.entity';
import { JobDescriptionVersionEntity } from '../job-descriptions/entities/job-description-version.entity';
import { FacebookPublishingModule } from '../facebook-publishing/facebook-publishing.module';
import { FileParserModule } from '../file-parser/file-parser.module';
import { LevelEntity } from '../levels/entities/level.entity';
import { MappingResultEntity } from '../mapping/entities/mapping-result.entity';
import { PositionEntity } from '../positions/entities/position.entity';
import { WorkflowEventEntity } from '../workflow-state/entities/workflow-event.entity';
import { JobPostingEntity } from './entities/job-posting.entity';
import { JobPostingsController } from './job-postings.controller';
import { JobPostingsService } from './job-postings.service';
import { PublicJobPostingsController } from './public-job-postings.controller';
import { FormSessionsModule } from '../form-sessions/form-sessions.module';

@Module({
  imports: [
    ApplicationsModule,
    CvDocumentsModule,
    CvParsingModule,
    FacebookPublishingModule,
    FileParserModule,
    FormSessionsModule,
    TypeOrmModule.forFeature([
      AiScreeningResultEntity,
      ApplicationEntity,
      AuditLogEntity,
      CandidateEntity,
      CvDocumentEntity,
      FormAnswerEntity,
      FormSessionEntity,
      HrReviewDecisionEntity,
      JobDescriptionEntity,
      JobDescriptionVersionEntity,
      JobPostingEntity,
      PositionEntity,
      LevelEntity,
      MappingResultEntity,
      ParsedProfileEntity,
      UserEntity,
      WorkflowEventEntity,
    ]),
  ],
  controllers: [JobPostingsController, PublicJobPostingsController],
  providers: [JobPostingsService],
  exports: [JobPostingsService],
})
export class JobPostingsModule {}
