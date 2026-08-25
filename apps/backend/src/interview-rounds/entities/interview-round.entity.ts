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
import { InterviewRoundType, InterviewResult, InterviewGrade } from '../../recruitment-common';
import { ApplicationEntity } from '../../applications/entities/application.entity';
import { UserEntity } from '../../auth/entities/user.entity';

@Entity('interview_rounds')
@Index('IDX_interview_rounds_application', ['applicationId'])
@Index('IDX_interview_rounds_round_type', ['roundType'])
@Index('IDX_interview_rounds_result', ['result'])
export class InterviewRoundEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'application_id', type: 'uuid' })
  applicationId: string;

  @ManyToOne(() => ApplicationEntity, (application) => application.interviewRounds, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'application_id' })
  application: ApplicationEntity;

  @Column({ type: 'varchar' })
  roundType: InterviewRoundType;

  // HỘI ĐỒNG CHUYÊN MÔN - nhiều người PV
  @Column({ name: 'interviewer_ids', type: 'uuid', array: true, nullable: true })
  interviewerIds: string[] | null;

  // Sync từ AMIS
  @Column({ name: 'external_interviewer_ids', type: 'jsonb', nullable: true })
  externalInterviewerIds: string[] | null;

  @Column({ name: 'scheduled_at', type: 'timestamptz', nullable: true })
  scheduledAt: Date | null;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  result: InterviewResult | null;

  @Column({ type: 'varchar', nullable: true })
  overallGrade: InterviewGrade | null;

  @Column({ type: 'jsonb', nullable: true })
  scores: Record<string, number> | null;

  @Column({ type: 'text', nullable: true })
  summary: string | null;

  @Column({ name: 'external_round_id', type: 'varchar', nullable: true })
  externalRoundId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
