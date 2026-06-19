import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExportService } from './export.service';
import { ExportController } from './export.controller';
import { EvaluationEntity } from '../evaluations/entities/evaluation.entity';
import { SessionEntity } from '../sessions/entities/session.entity';
import { CandidateEntity } from '../candidates/entities/candidate.entity';
import { CategoriesModule } from '../categories/categories.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([EvaluationEntity, SessionEntity, CandidateEntity]),
    CategoriesModule,
  ],
  controllers: [ExportController],
  providers: [ExportService],
  exports: [ExportService],
})
export class ExportModule {}
