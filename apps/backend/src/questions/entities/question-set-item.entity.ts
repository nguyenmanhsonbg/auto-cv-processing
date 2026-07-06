import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { QuestionEntity } from './question.entity';
import { QuestionSetEntity } from './question-set.entity';

@Entity('question_set_items')
export class QuestionSetItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'question_set_id', type: 'uuid' })
  questionSetId: string;

  @ManyToOne(() => QuestionSetEntity, (set) => set.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'question_set_id' })
  questionSet: QuestionSetEntity;

  @Column({ name: 'question_id', type: 'uuid', nullable: true })
  questionId: string | null;

  @ManyToOne(() => QuestionEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'question_id' })
  question: QuestionEntity | null;

  @Column({ name: 'question_text_snapshot', type: 'text' })
  questionTextSnapshot: string;

  @Column({ name: 'question_type', type: 'varchar' })
  questionType: string;

  @Column({ name: 'order_index', type: 'integer', default: 0 })
  orderIndex: number;

  @Column({ type: 'boolean', default: true })
  required: boolean;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;
}
