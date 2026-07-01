import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
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

@Entity('job_descriptions')
@Index('IDX_job_descriptions_status', ['status'])
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

  @Column({ type: 'jsonb' })
  requirements: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  benefits: Record<string, unknown> | null;

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
