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
import { JobPostingStatus } from '../../recruitment-common';
import { ApplicationEntity } from '../../applications/entities/application.entity';
import { UserEntity } from '../../auth/entities/user.entity';
import { JobDescriptionEntity } from '../../job-descriptions/entities/job-description.entity';
import { JobDescriptionVersionEntity } from '../../job-descriptions/entities/job-description-version.entity';
import { QuestionSetEntity } from '../../questions/entities/question-set.entity';

@Entity('job_postings')
@Index('UQ_job_postings_public_slug', ['publicSlug'], { unique: true })
@Index('IDX_job_postings_status', ['status'])
export class JobPostingEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'job_description_id', type: 'uuid' })
  jobDescriptionId: string;

  @ManyToOne(() => JobDescriptionEntity, (jobDescription) => jobDescription.postings, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'job_description_id' })
  jobDescription: JobDescriptionEntity;

  @Column({ name: 'job_description_version_id', type: 'uuid' })
  jobDescriptionVersionId: string;

  @ManyToOne(() => JobDescriptionVersionEntity, (version) => version.jobPostings, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'job_description_version_id' })
  jobDescriptionVersion: JobDescriptionVersionEntity;

  @Column({ type: 'varchar' })
  title: string;

  @Column({ name: 'public_slug', type: 'varchar' })
  publicSlug: string;

  @Column({
    type: 'varchar',
    default: JobPostingStatus.DRAFT,
  })
  status: JobPostingStatus;

  @Column({ name: 'open_at', type: 'timestamp', nullable: true })
  openAt: Date | null;

  @Column({ name: 'close_at', type: 'timestamp', nullable: true })
  closeAt: Date | null;

  @Column({ name: 'form_question_ids', type: 'jsonb', nullable: true })
  formQuestionIds: string[] | null;

  @Column({ name: 'form_question_set_id', type: 'uuid', nullable: true })
  formQuestionSetId: string | null;

  @ManyToOne(() => QuestionSetEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'form_question_set_id' })
  formQuestionSet: QuestionSetEntity | null;

  @Column({ name: 'created_by_id', type: 'uuid' })
  createdById: string;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by_id' })
  createdBy: UserEntity;

  @OneToMany(() => ApplicationEntity, (application) => application.jobPosting)
  applications: ApplicationEntity[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
