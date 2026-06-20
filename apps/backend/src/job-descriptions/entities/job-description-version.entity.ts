import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { JobDescriptionVersionStatus } from '../../recruitment-common';
import { ApplicationEntity } from '../../applications/entities/application.entity';
import { UserEntity } from '../../auth/entities/user.entity';
import { JobPostingEntity } from '../../job-postings/entities/job-posting.entity';
import { JobDescriptionEntity } from './job-description.entity';

@Entity('job_description_versions')
@Index('UQ_job_description_versions_version', ['jobDescriptionId', 'versionNo'], {
  unique: true,
})
export class JobDescriptionVersionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'job_description_id', type: 'uuid' })
  jobDescriptionId: string;

  @ManyToOne(() => JobDescriptionEntity, (jobDescription) => jobDescription.versions, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'job_description_id' })
  jobDescription: JobDescriptionEntity;

  @Column({ name: 'version_no', type: 'integer' })
  versionNo: number;

  @Column({ type: 'jsonb' })
  snapshot: Record<string, unknown>;

  @Column({
    type: 'varchar',
    default: JobDescriptionVersionStatus.ACTIVE,
  })
  status: JobDescriptionVersionStatus;

  @Column({ name: 'created_by_id', type: 'uuid' })
  createdById: string;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by_id' })
  createdBy: UserEntity;

  @OneToMany(() => JobPostingEntity, (posting) => posting.jobDescriptionVersion)
  jobPostings: JobPostingEntity[];

  @OneToMany(() => ApplicationEntity, (application) => application.jobDescriptionVersion)
  applications: ApplicationEntity[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}
