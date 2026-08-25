import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './services/dashboard.service';
import { ApplicationEntity } from '../applications/entities/application.entity';
import { CandidateEntity } from '../candidates/entities/candidate.entity';
import { InterviewRoundEntity } from '../interview-rounds/entities/interview-round.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ApplicationEntity,
      CandidateEntity,
      InterviewRoundEntity,
    ]),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
