import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { InterviewEvaluationAuditAction } from '@interview-assistant/shared';

@Entity('interview_evaluation_audits')
@Index('IDX_interview_evaluation_audits_round_created', ['roundId', 'createdAt'])
export class InterviewEvaluationAuditEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'case_id', type: 'uuid' })
  caseId: string;

  @Column({ name: 'round_id', type: 'uuid' })
  roundId: string;

  @Column({ name: 'actor_id', type: 'uuid' })
  actorId: string;

  @Column({ type: 'varchar' })
  action: InterviewEvaluationAuditAction;

  @Column({ name: 'from_status', type: 'varchar', nullable: true })
  fromStatus: string | null;

  @Column({ name: 'to_status', type: 'varchar', nullable: true })
  toStatus: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}
