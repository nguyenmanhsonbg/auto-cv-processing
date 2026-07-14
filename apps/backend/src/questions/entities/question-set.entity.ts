import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { JobDescriptionEntity } from '../../job-descriptions/entities/job-description.entity';
import { JobDescriptionVersionEntity } from '../../job-descriptions/entities/job-description-version.entity';
import { PositionEntity } from '../../positions/entities/position.entity';
import { LevelEntity } from '../../levels/entities/level.entity';
import { UserEntity } from '../../auth/entities/user.entity';
import { QuestionSetItemEntity } from './question-set-item.entity';
import { FormSessionEntity } from '../../form-sessions/entities/form-session.entity';

@Entity('question_sets')
export class QuestionSetEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'job_description_id', type: 'uuid', nullable: true })
  jobDescriptionId: string | null;

  @ManyToOne(() => JobDescriptionEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'job_description_id' })
  jobDescription: JobDescriptionEntity | null;

  @Column({ name: 'job_description_version_id', type: 'uuid', nullable: true })
  jobDescriptionVersionId: string | null;

  @ManyToOne(() => JobDescriptionVersionEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'job_description_version_id' })
  jobDescriptionVersion: JobDescriptionVersionEntity | null;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ name: 'position_id', type: 'uuid', nullable: true })
  positionId: string | null;

  @ManyToOne(() => PositionEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'position_id' })
  position: PositionEntity | null;

  @Column({ name: 'level_id', type: 'uuid', nullable: true })
  levelId: string | null;

  @ManyToOne(() => LevelEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'level_id' })
  level: LevelEntity | null;

  @Column({ type: 'varchar', default: 'DRAFT' })
  status: string;

  @Column({ name: 'source_system', type: 'varchar', nullable: true })
  sourceSystem: string | null;

  @Column({ name: 'source_job_id', type: 'varchar', nullable: true })
  sourceJobId: string | null;

  @Column({ name: 'source_snapshot_hash', type: 'varchar', nullable: true })
  sourceSnapshotHash: string | null;

  @Column({ name: 'source_snapshot', type: 'jsonb', nullable: true })
  sourceSnapshot: Record<string, unknown> | null;

  @Column({ name: 'source_last_synced_at', type: 'timestamp', nullable: true })
  sourceLastSyncedAt: Date | null;

  @Column({ name: 'created_by_id', type: 'uuid' })
  createdById: string;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by_id' })
  createdBy: UserEntity;

  @OneToMany(() => QuestionSetItemEntity, (item) => item.questionSet, { cascade: true })
  items: QuestionSetItemEntity[];

  @OneToMany(() => FormSessionEntity, (session) => session.questionSetId)
  formSessions: FormSessionEntity[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
