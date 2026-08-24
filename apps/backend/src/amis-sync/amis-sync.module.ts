import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { AmisSyncController } from './amis-sync.controller';
import { AmisSyncService } from './services/amis-sync.service';
import { AmisPollService } from './services/amis-poll.service';
import { ApplicationEntity } from '../applications/entities/application.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ApplicationEntity]),
    ScheduleModule,
  ],
  controllers: [AmisSyncController],
  providers: [AmisSyncService, AmisPollService],
  exports: [AmisSyncService, AmisPollService],
})
export class AmisSyncModule {}
