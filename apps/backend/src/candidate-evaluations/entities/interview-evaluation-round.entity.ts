import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  InterviewEvaluationFormData,
  InterviewEvaluationRoundStatus,
} from '@interview-assistant/shared';

@Entity('interview_evaluation_rounds')
@Index('UQ_interview_evaluation_rounds_case_key', ['caseId', 'roundKey'], { unique: true })
export class InterviewEvaluationRoundEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'case_id', type: 'uuid' })
  caseId: string;

  @Index('IDX_interview_evaluation_rounds_committee_id')
  @Column({ name: 'committee_id', type: 'uuid', nullable: true })
  committeeId: string | null;

  @Column({ name: 'round_key', type: 'varchar' })
  roundKey: string;

  @Column({ name: 'round_name', type: 'varchar' })
  roundName: string;

  @Column({ name: 'amis_round_id', type: 'varchar', nullable: true })
  amisRoundId: string | null;

  @Column({ name: 'amis_round_type', type: 'integer', nullable: true })
  amisRoundType: number | null;

  @Column({ name: 'amis_sort_order', type: 'integer', nullable: true })
  amisSortOrder: number | null;

  @Column({ name: 'sort_order', type: 'integer' })
  sortOrder: number;

  @Column({ type: 'varchar', default: InterviewEvaluationRoundStatus.READY_TO_EVALUATE })
  status: InterviewEvaluationRoundStatus;

  @Column({ name: 'hrbp_data', type: 'jsonb', default: () => "'{}'" })
  hrbpData: InterviewEvaluationFormData;

  @Column({ name: 'committee_data', type: 'jsonb', default: () => "'{}'" })
  committeeData: InterviewEvaluationFormData;

  @Column({ name: 'aggregate_data', type: 'jsonb', default: () => "'{}'" })
  aggregateData: InterviewEvaluationFormData;

  @Column({ name: 'version', type: 'integer', default: 1 })
  version: number;

  @Column({ name: 'completed_by_id', type: 'uuid', nullable: true })
  completedById: string | null;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
