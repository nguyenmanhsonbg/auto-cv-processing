import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApplicationEntity } from '../applications/entities/application.entity';
import { WorkflowEventEntity } from './entities/workflow-event.entity';
import { WorkflowStateService } from './workflow-state.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ApplicationEntity,
      WorkflowEventEntity,
    ]),
  ],
  providers: [WorkflowStateService],
  exports: [WorkflowStateService],
})
export class WorkflowStateModule {}
