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
  InterviewEvaluationReviewerSection,
  InterviewEvaluationReviewerStatus,
} from '@interview-assistant/shared';

@Entity('interview_evaluation_reviewers')
@Index('UQ_interview_evaluation_reviewers_round_user_section', ['roundId', 'userId', 'section'], {
  unique: true,
})
export class InterviewEvaluationReviewerEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'round_id', type: 'uuid' })
  roundId: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar' })
  section: InterviewEvaluationReviewerSection;

  @Column({ type: 'varchar', default: InterviewEvaluationReviewerStatus.PENDING })
  status: InterviewEvaluationReviewerStatus;

  @Column({ name: 'form_data', type: 'jsonb', default: () => "'{}'" })
  formData: InterviewEvaluationFormData;

  @Column({ name: 'submitted_at', type: 'timestamp', nullable: true })
  submittedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
