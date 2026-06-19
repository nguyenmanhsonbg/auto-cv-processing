import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { OverallResult, AiEvaluationSuggestion } from '@interview-assistant/shared';
import { SessionEntity } from '../../sessions/entities/session.entity';
import { UserEntity } from '../../auth/entities/user.entity';

@Entity('evaluations')
export class EvaluationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  sessionId: string;

  @ManyToOne(() => SessionEntity)
  @JoinColumn({ name: 'sessionId' })
  session: SessionEntity;

  @Column()
  evaluatorId: string;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'evaluatorId' })
  evaluator: UserEntity;

  // HR Evaluation section
  @Column({ type: 'jsonb', nullable: true })
  hrEvaluation: {
    knowledge?: string;
    skills?: string;
    language?: string;
    certificates?: string;
    experience?: string;
    character?: string;
    careerGoal?: string;
  };

  // Technical panel ratings (array of {subcategory, comment, rating 1-5})
  @Column({ type: 'jsonb', default: [] })
  technicalRatings: { subcategory: string; comment?: string; rating?: number }[];

  // Soft skill ratings (Section III, "2. KỸ NĂNG NGHIỆP VỤ")
  @Column({ type: 'jsonb', default: [] })
  softSkillRatings: { subcategory: string; comment?: string; rating?: number }[];

  // Zone assessment
  @Column({ nullable: true })
  zoneResult: string;

  @Column('text', { nullable: true })
  zoneExplanation: string;

  // Final result fields
  @Column({ nullable: true })
  finalLevel: string;

  @Column({ nullable: true })
  finalZone: string;

  @Column({ nullable: true })
  finalSubZone: string;

  // Personality ratings
  @Column({ type: 'jsonb', default: [] })
  personalityRatings: { category: string; rating?: number; reasoning?: string }[];

  // Other info
  @Column({ nullable: true })
  expectedSalary: string;

  @Column({ nullable: true })
  noticePeriod: string;

  @Column('text', { nullable: true })
  plannedAssignment: string;

  @Column('text', { nullable: true })
  jobDescription: string;

  // Overall
  @Column({ type: 'enum', enum: OverallResult, default: OverallResult.PENDING })
  overallResult: OverallResult;

  @Column('text', { nullable: true })
  overallNotes: string;

  @Column('text', { nullable: true })
  aiSummary: string;

  @Column({ type: 'jsonb', nullable: true })
  aiEvaluationSuggestion: AiEvaluationSuggestion | null;

  @Column({ type: 'varchar', nullable: true })
  aiAnalysisStatus: 'analyzing' | 'completed' | 'failed' | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
