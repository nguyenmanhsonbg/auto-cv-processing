import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ApplicationEntity } from '../../applications/entities/application.entity';
import { FormSessionEntity } from './form-session.entity';

@Entity('form_answers')
@Index('UQ_form_answers_item', ['formSessionId', 'questionSetItemId'], { unique: true })
export class FormAnswerEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'form_session_id', type: 'uuid' })
  formSessionId: string;

  @ManyToOne(() => FormSessionEntity, (formSession) => formSession.answers, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'form_session_id' })
  formSession: FormSessionEntity;

  @Column({ name: 'application_id', type: 'uuid' })
  applicationId: string;

  @ManyToOne(() => ApplicationEntity, (application) => application.formAnswers, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'application_id' })
  application: ApplicationEntity;

  @Column({ name: 'question_set_item_id', type: 'uuid' })
  questionSetItemId: string;

  @Column({ type: 'jsonb' })
  answer: Record<string, unknown>;

  @CreateDateColumn({ name: 'answered_at', type: 'timestamp' })
  answeredAt: Date;
}
