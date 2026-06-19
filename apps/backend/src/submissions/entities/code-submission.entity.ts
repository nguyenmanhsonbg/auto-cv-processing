import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { SubmissionStatus } from '@interview-assistant/shared';
import { SessionQuestionEntity } from '../../sessions/entities/session-question.entity';

@Entity('code_submissions')
export class CodeSubmissionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  sessionQuestionId: string;

  @ManyToOne(() => SessionQuestionEntity, (sq) => sq.submissions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sessionQuestionId' })
  sessionQuestion: SessionQuestionEntity;

  @Column()
  language: string;

  @Column('text')
  code: string;

  @Column({ type: 'enum', enum: SubmissionStatus, default: SubmissionStatus.PENDING })
  status: SubmissionStatus;

  @Column({ type: 'jsonb', nullable: true })
  results: Record<string, unknown>[];

  @Column({ type: 'jsonb', nullable: true })
  aiEvaluation: Record<string, unknown>;

  @CreateDateColumn()
  submittedAt: Date;
}
