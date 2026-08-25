import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InterviewRoundsController } from './interview-rounds.controller';
import { InterviewRoundsService } from './services/interview-rounds.service';
import { InterviewRoundEntity } from './entities/interview-round.entity';
import { ApplicationEntity } from '../applications/entities/application.entity';

@Module({
  imports: [TypeOrmModule.forFeature([InterviewRoundEntity, ApplicationEntity])],
  controllers: [InterviewRoundsController],
  providers: [InterviewRoundsService],
  exports: [InterviewRoundsService],
})
export class InterviewRoundsModule {}
