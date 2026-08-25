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
import { TestRoundType, TestResult } from '../../recruitment-common';
import { ApplicationEntity } from '../../applications/entities/application.entity';

@Entity('test_rounds')
@Index('IDX_test_rounds_application', ['applicationId'])
@Index('IDX_test_rounds_round_type', ['roundType'])
@Index('IDX_test_rounds_result', ['result'])
export class TestRoundEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'application_id', type: 'uuid' })
  applicationId: string;

  @ManyToOne(() => ApplicationEntity, (application) => application.testRounds, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'application_id' })
  application: ApplicationEntity;

  @Column({ type: 'varchar' })
  roundType: TestRoundType;

  @Column({ name: 'test_type', type: 'varchar', nullable: true })
  testType: 'TECHNICAL' | 'SOFT_SKILLS' | 'GENERAL' | null;

  @Column({ name: 'assigned_at', type: 'timestamptz', nullable: true })
  assignedAt: Date | null;

  @Column({ name: 'deadline_at', type: 'timestamptz', nullable: true })
  deadlineAt: Date | null;

  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt: Date | null;

  @Column({ name: 'evaluated_at', type: 'timestamptz', nullable: true })
  evaluatedAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  result: TestResult | null;

  @Column({ name: 'score', type: 'decimal', precision: 5, scale: 2, nullable: true })
  score: number | null;

  @Column({ name: 'passing_score', type: 'decimal', precision: 5, scale: 2, nullable: true })
  passingScore: number | null;

  @Column({ type: 'text', nullable: true })
  comment: string | null;

  @Column({ name: 'external_test_id', type: 'varchar', nullable: true })
  externalTestId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
