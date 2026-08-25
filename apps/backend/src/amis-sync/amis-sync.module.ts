import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AmisSyncController } from './amis-sync.controller';
import { AmisPollService } from './services/amis-poll.service';
import { AmisSyncService } from './services/amis-sync.service';
import { ApplicationEntity } from '../applications/entities/application.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ApplicationEntity]),
  ],
  controllers: [AmisSyncController],
  providers: [AmisSyncService, AmisPollService],
  exports: [AmisSyncService],
})
export class AmisSyncModule {}
