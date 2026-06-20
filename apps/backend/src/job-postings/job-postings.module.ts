import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiScreeningResultEntity } from '../ai-screening/entities/ai-screening-result.entity';
import { ApplicationEntity } from '../applications/entities/application.entity';
import { AuditLogEntity } from '../audit-logs/entities/audit-log.entity';
import { UserEntity } from '../auth/entities/user.entity';
import { CandidateEntity } from '../candidates/entities/candidate.entity';
import { CvDocumentEntity } from '../cv-documents/entities/cv-document.entity';
import { ParsedProfileEntity } from '../cv-documents/entities/parsed-profile.entity';
import { FormAnswerEntity } from '../form-sessions/entities/form-answer.entity';
import { FormSessionEntity } from '../form-sessions/entities/form-session.entity';
import { HrReviewDecisionEntity } from '../hr-review/entities/hr-review-decision.entity';
import { JobDescriptionEntity } from '../job-descriptions/entities/job-description.entity';
import { JobDescriptionVersionEntity } from '../job-descriptions/entities/job-description-version.entity';
import { LevelEntity } from '../levels/entities/level.entity';
import { MappingResultEntity } from '../mapping/entities/mapping-result.entity';
import { PositionEntity } from '../positions/entities/position.entity';
import { WorkflowEventEntity } from '../workflow-state/entities/workflow-event.entity';
import { JobPostingEntity } from './entities/job-posting.entity';
import { JobPostingsService } from './job-postings.service';
import { PublicJobPostingsController } from './public-job-postings.controller';

@Module({
  imports: [
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
  controllers: [PublicJobPostingsController],
  providers: [JobPostingsService],
  exports: [JobPostingsService],
})
export class JobPostingsModule {}
