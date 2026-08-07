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

@Entity('amis_application_stage_reminders')
@Index('UQ_amis_stage_reminders_cycle', [
  'applicationId',
  'amisRecruitmentRoundId',
  'stageEnteredAt',
], { unique: true })
@Index('IDX_amis_stage_reminders_due', [
  'isActive',
  'stageEnteredAt',
  'firstReminderSentAt',
  'secondReminderSentAt',
])
@Index('IDX_amis_stage_reminders_hr', ['hrEmail', 'isActive'])
export class AmisApplicationStageReminderEntity {
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

  @Column({ name: 'stage_entered_at', type: 'timestamp' })
  stageEnteredAt: Date;

  @Column({ name: 'candidate_amis_url', type: 'text', nullable: true })
  candidateAmisUrl: string | null;

  @Column({ name: 'hr_mapping_id', type: 'uuid', nullable: true })
  hrMappingId: string | null;

  @Column({ name: 'hr_user_id', type: 'uuid', nullable: true })
  hrUserId: string | null;

  @Column({ name: 'hr_email', type: 'varchar', nullable: true })
  hrEmail: string | null;

  @Column({ name: 'hr_name', type: 'varchar', nullable: true })
  hrName: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'closed_at', type: 'timestamp', nullable: true })
  closedAt: Date | null;

  @Column({ name: 'first_reminder_sent_at', type: 'timestamp', nullable: true })
  firstReminderSentAt: Date | null;

  @Column({ name: 'second_reminder_sent_at', type: 'timestamp', nullable: true })
  secondReminderSentAt: Date | null;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | null;

  @Column({ name: 'last_error_at', type: 'timestamp', nullable: true })
  lastErrorAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
