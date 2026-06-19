import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { SessionEntity } from './session.entity';

@Entity('session_survey_questions')
export class SessionSurveyQuestionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  sessionId: string;

  @ManyToOne(() => SessionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sessionId' })
  session: SessionEntity;

  @Column({ type: 'text' })
  question: string;

  @Column({ type: 'varchar' })
  category: string;

  @Column({ type: 'varchar', nullable: true })
  subcategory: string | null;

  /** One-sentence Vietnamese explanation of what the answer reveals. */
  @Column({ type: 'text' })
  purpose: string;

  /** AI-generated clickable answer choices (ordered most to least experienced). */
  @Column({ type: 'jsonb', default: [] })
  choices: string[];

  /** The selected choice text (or free-text override) filled in by the interviewer. */
  @Column({ type: 'text', nullable: true })
  answer: string | null;

  @Column({ type: 'int', default: 0 })
  orderIndex: number;

  @CreateDateColumn()
  createdAt: Date;
}
