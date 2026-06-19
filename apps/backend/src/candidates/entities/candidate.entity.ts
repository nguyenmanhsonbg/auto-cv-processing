import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
  ManyToMany,
  JoinColumn,
  JoinTable,
} from 'typeorm';
import { CandidateLevel } from '@interview-assistant/shared';
import { SessionEntity } from '../../sessions/entities/session.entity';
import { UserEntity } from '../../auth/entities/user.entity';

@Entity('candidates')
export class CandidateEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ unique: true, nullable: true })
  slug: string;

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  birthYear: number;

  @Column({ default: 'Backend Developer' })
  position: string;

  @Column({ type: 'enum', enum: CandidateLevel, default: CandidateLevel.ENTRY })
  level: CandidateLevel;

  @Column({ nullable: true })
  resumeUrl: string;

  @Column({ nullable: true })
  profileXlsxUrl: string;

  @Column({ type: 'jsonb', nullable: true })
  parsedProfile: Record<string, unknown>;

  @Column({ default: 'idle' })
  analyzeStatus: 'idle' | 'analyzing';

  // Tracks who created this candidate so interviewers only see their own
  @Column({ type: 'varchar', nullable: true })
  createdById: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL', eager: false })
  @JoinColumn({ name: 'createdById' })
  createdBy?: UserEntity;

  @ManyToMany(() => UserEntity, { eager: false })
  @JoinTable({
    name: 'candidate_assignees',
    joinColumn: { name: 'candidateId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'userId', referencedColumnName: 'id' },
  })
  assignees: UserEntity[];

  @OneToMany(() => SessionEntity, (session) => session.candidate)
  sessions: SessionEntity[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
