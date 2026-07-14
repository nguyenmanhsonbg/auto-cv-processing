import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { JobDescriptionStatus } from '../../recruitment-common';
import { UserEntity } from '../../auth/entities/user.entity';
import { LevelEntity } from '../../levels/entities/level.entity';
import { PositionEntity } from '../../positions/entities/position.entity';
import { JobPostingEntity } from '../../job-postings/entities/job-posting.entity';
import { JobDescriptionVersionEntity } from './job-description-version.entity';
import { JobSourceCategoryEntity } from './job-source-category.entity';

@Entity('job_descriptions')
@Index('IDX_job_descriptions_status', ['status'])
@Index('UQ_job_descriptions_source_system_job_id', ['sourceSystem', 'sourceJobId'], {
  unique: true,
  where: '"source_system" IS NOT NULL AND "source_job_id" IS NOT NULL',
})
export class JobDescriptionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  title: string;

  @Column({ name: 'position_id', type: 'uuid', nullable: true })
  positionId: string | null;

  @ManyToOne(() => PositionEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'position_id' })
  position: PositionEntity | null;

  @Column({ name: 'level_id', type: 'uuid', nullable: true })
  levelId: string | null;

  @ManyToOne(() => LevelEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'level_id' })
  level: LevelEntity | null;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  summary: string | null;

  @Column({ type: 'text', nullable: true })
  overview: string | null;

  @Column({ type: 'text', nullable: true })
  responsibilities: string | null;

  @Column({ type: 'text' })
  requirements: string;

  @Column({ type: 'jsonb', nullable: true })
  benefits: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  salary: string | null;

  @Column({ name: 'annual_leave_days', type: 'text', nullable: true })
  annualLeaveDays: string | null;

  @Column({ type: 'text', nullable: true })
  department: string | null;

  @Column({ name: 'application_deadline', type: 'date', nullable: true })
  applicationDeadline: string | null;

  @Column({ name: 'source_system', type: 'varchar', nullable: true })
  sourceSystem: string | null;

  @Column({ name: 'source_job_id', type: 'varchar', nullable: true })
  sourceJobId: string | null;

  @Column({ name: 'source_slug', type: 'varchar', nullable: true })
  sourceSlug: string | null;

  @Column({ name: 'source_url', type: 'text', nullable: true })
  sourceUrl: string | null;

  @Column({ name: 'source_department', type: 'varchar', nullable: true })
  sourceDepartment: string | null;

  @Column({ name: 'source_created_at', type: 'timestamptz', nullable: true })
  sourceCreatedAt: Date | null;

  @Column({ name: 'source_modified_at', type: 'timestamptz', nullable: true })
  sourceModifiedAt: Date | null;

  @Column({ name: 'source_deadline_at', type: 'timestamp', nullable: true })
  sourceDeadlineAt: Date | null;

  @Column({ name: 'source_snapshot_hash', type: 'varchar', nullable: true })
  sourceSnapshotHash: string | null;

  @Column({ name: 'source_snapshot', type: 'jsonb', nullable: true })
  sourceSnapshot: Record<string, unknown> | null;

  @Column({ name: 'source_last_synced_at', type: 'timestamp', nullable: true })
  sourceLastSyncedAt: Date | null;

  @Column({ name: 'source_payload', type: 'jsonb', nullable: true })
  sourcePayload: Record<string, unknown> | null;

  @Column({ name: 'source_content_hash', type: 'varchar', nullable: true })
  sourceContentHash: string | null;

  @Column({ name: 'last_synced_at', type: 'timestamptz', nullable: true })
  lastSyncedAt: Date | null;

  @ManyToMany(() => JobSourceCategoryEntity, (category) => category.jobDescriptions)
  @JoinTable({
    name: 'job_description_source_categories',
    joinColumn: { name: 'job_description_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'source_category_id', referencedColumnName: 'id' },
  })
  sourceCategories: JobSourceCategoryEntity[];

  @Column({
    type: 'varchar',
    default: JobDescriptionStatus.DRAFT,
  })
  status: JobDescriptionStatus;

  @Column({ name: 'created_by_id', type: 'uuid' })
  createdById: string;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by_id' })
  createdBy: UserEntity;

  @OneToMany(() => JobDescriptionVersionEntity, (version) => version.jobDescription)
  versions: JobDescriptionVersionEntity[];

  @OneToMany(() => JobPostingEntity, (posting) => posting.jobDescription)
  postings: JobPostingEntity[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
