import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ApplicationEntity } from '../../applications/entities/application.entity';

export type CandidateStageNotificationStatus =
  | 'PENDING'
  | 'SENDING'
  | 'SENT'
  | 'FAILED'
  | 'SKIPPED_NO_EMAIL';

@Entity('amis_candidate_stage_notifications')
@Index(
  'UQ_amis_candidate_stage_notifications_round',
  ['applicationId', 'amisRecruitmentId', 'amisRecruitmentRoundId'],
  { unique: true },
)
@Index('IDX_amis_candidate_stage_notifications_due', [
  'status',
  'nextAttemptAt',
  'createdAt',
])
export class AmisCandidateStageNotificationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'application_id', type: 'uuid' })
  applicationId: string;

  @ManyToOne(() => ApplicationEntity, { onDelete: 'RESTRICT', eager: false })
  @JoinColumn({ name: 'application_id' })
  application: ApplicationEntity;

  @Column({ name: 'amis_recruitment_id', type: 'varchar' })
  amisRecruitmentId: string;

  @Column({ name: 'amis_candidate_id', type: 'varchar' })
  amisCandidateId: string;

  @Column({ name: 'amis_recruitment_round_id', type: 'varchar' })
  amisRecruitmentRoundId: string;

  @Column({ name: 'amis_recruitment_round_name', type: 'varchar', nullable: true })
  amisRecruitmentRoundName: string | null;

  @Column({ name: 'candidate_email', type: 'varchar' })
  candidateEmail: string;

  @Column({ name: 'candidate_name', type: 'varchar', nullable: true })
  candidateName: string | null;

  @Column({ name: 'job_title', type: 'varchar', nullable: true })
  jobTitle: string | null;

  @Column({ name: 'transitioned_at', type: 'timestamp' })
  transitionedAt: Date;

  @Column({ name: 'interview_scheduled_at', type: 'timestamptz', nullable: true })
  interviewScheduledAt: Date | null;

  @Column({ name: 'interview_ends_at', type: 'timestamptz', nullable: true })
  interviewEndsAt: Date | null;

  @Column({ name: 'interview_timezone', type: 'varchar', nullable: true })
  interviewTimezone: string | null;

  @Column({ name: 'interview_duration_minutes', type: 'integer', nullable: true })
  interviewDurationMinutes: number | null;

  @Column({ type: 'varchar', default: 'PENDING' })
  status: CandidateStageNotificationStatus;

  @Column({ name: 'attempt_count', type: 'integer', default: 0 })
  attemptCount: number;

  @Column({ name: 'last_attempt_at', type: 'timestamp', nullable: true })
  lastAttemptAt: Date | null;

  @Column({ name: 'next_attempt_at', type: 'timestamp', nullable: true })
  nextAttemptAt: Date | null;

  @Column({ name: 'sent_at', type: 'timestamp', nullable: true })
  sentAt: Date | null;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
