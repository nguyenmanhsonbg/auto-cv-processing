import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '../auth/entities/user.entity';
import { ApplicationEntity } from '../applications/entities/application.entity';
import { InterviewEvaluationsController } from './interview-evaluations.controller';
import { InterviewEvaluationInboxController } from './interview-evaluation-inbox.controller';
import { InterviewEvaluationsService } from './interview-evaluations.service';
import { InterviewEvaluationAuditEntity } from './entities/interview-evaluation-audit.entity';
import { InterviewEvaluationCaseEntity } from './entities/interview-evaluation-case.entity';
import { InterviewEvaluationReviewerEntity } from './entities/interview-evaluation-reviewer.entity';
import { InterviewEvaluationRoundEntity } from './entities/interview-evaluation-round.entity';
import { InterviewCommitteeEntity } from './entities/interview-committee.entity';
import { InterviewCommitteeMemberEntity } from './entities/interview-committee-member.entity';
import { AmisRecruitmentBoardMemberEntity } from '../extension-integration/entities/amis-recruitment-board-member.entity';
import { RecruitmentExternalReferenceEntity } from '../extension-integration/entities/recruitment-external-reference.entity';
import { InterviewCommitteesController } from './interview-committees.controller';
import { InterviewCommitteesService } from './interview-committees.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ApplicationEntity,
      UserEntity,
      InterviewEvaluationAuditEntity,
      InterviewEvaluationCaseEntity,
      InterviewEvaluationReviewerEntity,
      InterviewEvaluationRoundEntity,
      InterviewCommitteeEntity,
      InterviewCommitteeMemberEntity,
      AmisRecruitmentBoardMemberEntity,
      RecruitmentExternalReferenceEntity,
    ]),
  ],
  controllers: [InterviewEvaluationsController, InterviewEvaluationInboxController, InterviewCommitteesController],
  providers: [InterviewEvaluationsService, InterviewCommitteesService],
})
export class InterviewEvaluationsModule {}
