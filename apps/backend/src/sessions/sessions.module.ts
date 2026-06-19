import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SessionEntity } from './entities/session.entity';
import { SessionQuestionEntity } from './entities/session-question.entity';
import { AntiCheatEventEntity } from './entities/anti-cheat-event.entity';
import { SessionSurveyQuestionEntity } from './entities/session-survey-question.entity';
import { SessionsService } from './sessions.service';
import { SessionsController } from './sessions.controller';
import { AiModule } from '../ai/ai.module';
import { CandidatesModule } from '../candidates/candidates.module';
import { QuestionsModule } from '../questions/questions.module';
import { SubmissionsModule } from '../submissions/submissions.module';
import { CategoriesModule } from '../categories/categories.module';
import { PositionsModule } from '../positions/positions.module';
import { LevelsModule } from '../levels/levels.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SessionEntity,
      SessionQuestionEntity,
      AntiCheatEventEntity,
      SessionSurveyQuestionEntity,
    ]),
    AiModule,
    CandidatesModule,
    QuestionsModule,
    SubmissionsModule,
    CategoriesModule,
    PositionsModule,
    LevelsModule,
  ],
  controllers: [SessionsController],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
