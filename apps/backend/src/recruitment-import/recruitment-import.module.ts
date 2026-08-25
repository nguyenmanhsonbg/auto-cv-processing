import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApplicationEntity } from '../applications/entities/application.entity';
import { CandidateEntity } from '../candidates/entities/candidate.entity';
import { InterviewRoundEntity } from '../interview-rounds/entities/interview-round.entity';
import { JobPostingEntity } from '../job-postings/entities/job-posting.entity';
import { OfferEntity } from '../offers/entities/offer.entity';
import { RecruitmentImportController } from './recruitment-import.controller';
import { RecruitmentImportParser } from './recruitment-import.parser';
import { RecruitmentImportService } from './recruitment-import.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ApplicationEntity,
      CandidateEntity,
      InterviewRoundEntity,
      JobPostingEntity,
      OfferEntity,
    ]),
  ],
  controllers: [RecruitmentImportController],
  providers: [RecruitmentImportParser, RecruitmentImportService],
  exports: [RecruitmentImportParser, RecruitmentImportService],
})
export class RecruitmentImportModule {}
