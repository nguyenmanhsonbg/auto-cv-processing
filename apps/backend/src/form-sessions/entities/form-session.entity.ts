import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { FormSessionStatus } from '../../recruitment-common';
import { AiScreeningResultEntity } from '../../ai-screening/entities/ai-screening-result.entity';
import { ApplicationEntity } from '../../applications/entities/application.entity';
import { FormAnswerEntity } from './form-answer.entity';

@Entity('form_sessions')
@Index('UQ_form_sessions_token_hash', ['tokenHash'], { unique: true })
@Index('IDX_form_sessions_application', ['applicationId'])
@Index('IDX_form_sessions_active', ['applicationId', 'questionSetId', 'status'])
export class FormSessionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'application_id', type: 'uuid' })
  applicationId: string;

  @ManyToOne(() => ApplicationEntity, (application) => application.formSessions, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'application_id' })
  application: ApplicationEntity;

  @Column({ name: 'question_set_id', type: 'uuid' })
  questionSetId: string;

  @Column({ name: 'token_hash', type: 'varchar' })
  tokenHash: string;

  @Column({
    type: 'varchar',
    default: FormSessionStatus.CREATED,
  })
  status: FormSessionStatus;

  @Column({ name: 'expires_at', type: 'timestamp' })
  expiresAt: Date;

  @Column({ name: 'sent_at', type: 'timestamp', nullable: true })
  sentAt: Date | null;

  @Column({ name: 'opened_at', type: 'timestamp', nullable: true })
  openedAt: Date | null;

  @Column({ name: 'submitted_at', type: 'timestamp', nullable: true })
  submittedAt: Date | null;

  @OneToMany(() => FormAnswerEntity, (answer) => answer.formSession)
  answers: FormAnswerEntity[];

  @OneToMany(() => AiScreeningResultEntity, (aiResult) => aiResult.formSession)
  aiScreeningResults: AiScreeningResultEntity[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}
