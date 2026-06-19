import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { SessionStatus, MeetingPlatform } from '@interview-assistant/shared';
import { CandidateEntity } from '../../candidates/entities/candidate.entity';
import { UserEntity } from '../../auth/entities/user.entity';
import { SessionQuestionEntity } from './session-question.entity';

@Entity('interview_sessions')
export class SessionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  candidateId: string;

  @ManyToOne(() => CandidateEntity, (candidate) => candidate.sessions)
  @JoinColumn({ name: 'candidateId' })
  candidate: CandidateEntity;

  @Column()
  createdById: string;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'createdById' })
  createdBy: UserEntity;

  @Column({ type: 'enum', enum: SessionStatus, default: SessionStatus.DRAFT })
  status: SessionStatus;

  @Column({ unique: true })
  accessToken: string;

  @Column({ unique: true, nullable: true })
  slug: string;

  @Column({ default: 'Backend Developer' })
  templatePosition: string;

  @Column({ default: 'ENTRY' })
  targetLevel: string;

  @Column({ type: 'timestamp', nullable: true })
  scheduledAt: Date;

  @Column({ type: 'enum', enum: MeetingPlatform, nullable: true })
  meetingPlatform: MeetingPlatform;

  @Column({ nullable: true })
  meetingLink: string;

  // When true, candidates see only one active question at a time; the next is revealed after submitting
  @Column({ default: false })
  sequentialMode: boolean;

  // When false, candidates cannot view any activated questions (interviewer has locked the view)
  @Column({ default: true })
  candidateViewEnabled: boolean;

  @OneToMany(() => SessionQuestionEntity, (sq) => sq.session, { cascade: true })
  questions: SessionQuestionEntity[];

  // Interviewer category/subcategory ratings stored independently of per-question ratings.
  // Key format: "CATEGORY::Subcategory name" → rating 1–5.
  @Column({ type: 'jsonb', nullable: true, default: {} })
  categoryRatings: Record<string, number>;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ nullable: true })
  startedAt: Date;

  @Column({ nullable: true })
  completedAt: Date;

  @Column({ type: 'timestamp', nullable: true, default: null })
  surveyActivatedAt: Date | null;

  @Column({ default: false })
  isSurveyGenerating: boolean;

  @Column({ default: false })
  isSurveySuggestGenerating: boolean;

  @Column({ type: 'jsonb', nullable: true, default: null })
  surveySuggestions: Array<{ questionId: string; reasoning: string }> | null;

  @UpdateDateColumn()
  updatedAt: Date;
}
