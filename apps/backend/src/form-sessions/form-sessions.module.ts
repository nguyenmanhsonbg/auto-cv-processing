import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';

import { FormSessionEntity } from './entities/form-session.entity';
import { FormAnswerEntity } from './entities/form-answer.entity';
import { QuestionSetEntity } from '../questions/entities/question-set.entity';
import { QuestionSetItemEntity } from '../questions/entities/question-set-item.entity';
import { ApplicationEntity } from '../applications/entities/application.entity';

import { FormSessionsService } from './form-sessions.service';
import { FormSessionsController } from './form-sessions.controller';
import { PublicFormSessionsController } from './public-form-sessions.controller';
import { WorkflowStateModule } from '../workflow-state/workflow-state.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    ConfigModule,
    WorkflowStateModule,
    NotificationModule,
    TypeOrmModule.forFeature([
      FormSessionEntity,
      FormAnswerEntity,
      QuestionSetEntity,
      QuestionSetItemEntity,
      ApplicationEntity,
    ]),
  ],
  controllers: [FormSessionsController, PublicFormSessionsController],
  providers: [FormSessionsService],
  exports: [FormSessionsService],
})
export class FormSessionsModule {}
