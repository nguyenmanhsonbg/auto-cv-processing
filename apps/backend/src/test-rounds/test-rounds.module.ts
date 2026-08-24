import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TestRoundsController } from './test-rounds.controller';
import { TestRoundsService } from './services/test-rounds.service';
import { TestRoundEntity } from './entities/test-round.entity';
import { ApplicationEntity } from '../applications/entities/application.entity';

@Module({
  imports: [TypeOrmModule.forFeature([TestRoundEntity, ApplicationEntity])],
  controllers: [TestRoundsController],
  providers: [TestRoundsService],
  exports: [TestRoundsService],
})
export class TestRoundsModule {}
