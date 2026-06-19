import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { SessionEntity } from './session.entity';
import { QuestionEntity } from '../../questions/entities/question.entity';
import { CodeSubmissionEntity } from '../../submissions/entities/code-submission.entity';

@Entity('session_questions')
export class SessionQuestionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  sessionId: string;

  @ManyToOne(() => SessionEntity, (session) => session.questions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sessionId' })
  session: SessionEntity;

  @Column()
  questionId: string;

  @ManyToOne(() => QuestionEntity)
  @JoinColumn({ name: 'questionId' })
  question: QuestionEntity;

  @Column({ default: 0 })
  orderIndex: number;

  @Column({ default: false })
  isActive: boolean;

  @Column({ nullable: true })
  activatedAt: Date;

  @Column('text', { nullable: true })
  candidateAnswer: string;

  @Column('text', { nullable: true })
  interviewerNote: string;

  @Column({ nullable: true })
  rating: number;

  @Column({ nullable: true })
  answeredAt: Date;

  @OneToMany(() => CodeSubmissionEntity, (sub) => sub.sessionQuestion, { cascade: true })
  submissions: CodeSubmissionEntity[];
}
