import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { InterviewEvaluationTemplate } from '@interview-assistant/shared';

@Entity('interview_evaluation_cases')
@Index('UQ_interview_evaluation_cases_application', ['applicationId'], { unique: true })
export class InterviewEvaluationCaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'application_id', type: 'uuid' })
  applicationId: string;

  @Column({ name: 'candidate_id', type: 'uuid' })
  candidateId: string;

  @Column({ name: 'job_posting_id', type: 'uuid' })
  jobPostingId: string;

  @Column({ name: 'job_description_version_id', type: 'uuid' })
  jobDescriptionVersionId: string;

  @Column({ type: 'varchar', enum: InterviewEvaluationTemplate })
  template: InterviewEvaluationTemplate;

  @Column({ name: 'created_by_id', type: 'uuid' })
  createdById: string;

  @Column({ name: 'current_round_id', type: 'uuid', nullable: true })
  currentRoundId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
