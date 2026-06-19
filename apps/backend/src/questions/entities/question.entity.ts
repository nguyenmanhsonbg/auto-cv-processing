import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { QuestionType } from '@interview-assistant/shared';

@Entity('questions')
export class QuestionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', nullable: true })
  category: string;

  @Column()
  subcategory: string;

  @Column({ nullable: true })
  competencyType: string; // 'KNOWLEDGE' | 'SKILL' | 'ADDITIONAL'

  @Column('text')
  text: string;

  @Column({ default: 1 })
  difficulty: number;

  @Column('text', { array: true, default: '{}' })
  targetLevels: string[];

  @Column({ type: 'enum', enum: QuestionType, default: QuestionType.OPEN_ENDED })
  type: QuestionType;

  @Column({ type: 'jsonb', nullable: true })
  options: { id: string; text: string }[];

  @Column({ type: 'jsonb', nullable: true })
  correctAnswers: string[];

  @Column('text', { nullable: true })
  expectedAnswer: string;

  @Column('text', { nullable: true })
  scoringGuide: string;

  @Column({ type: 'jsonb', nullable: true })
  testCases: { input: string; expectedOutput: string; description?: string }[];

  @Column({ type: 'jsonb', nullable: true })
  hiddenTestCases: { input: string; expectedOutput: string; description?: string }[];

  @Column({ nullable: true })
  timeLimit: number;

  @Column({ nullable: true })
  memoryLimit: number;

  @Column({ type: 'jsonb', nullable: true })
  starterCode: { language: string; code: string }[];

  @Column({ type: 'jsonb', nullable: true })
  architectureTemplate: Record<string, unknown>;

  @Column({ unique: true, nullable: true })
  code: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: false })
  isCustomized: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
