import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ExtensionInstanceEntity } from '../../extension-integration/entities/extension-instance.entity';
import { JobPostingEntity } from '../../job-postings/entities/job-posting.entity';
import {
  FacebookPublishResultStatus,
  FacebookReviewStatus,
  FacebookPublishTargetType,
} from '../facebook-publishing.types';
import { FacebookPublishTargetEntity } from './facebook-publish-target.entity';

@Entity('facebook_publish_histories')
@Index('IDX_facebook_publish_histories_job_posting', ['jobPostingId'])
@Index('IDX_facebook_publish_histories_status', ['status'])
@Index('IDX_facebook_publish_histories_review_status', ['facebookReviewStatus'])
export class FacebookPublishHistoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'job_posting_id', type: 'uuid' })
  jobPostingId: string;

  @ManyToOne(() => JobPostingEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'job_posting_id' })
  jobPosting: JobPostingEntity;

  @Column({ name: 'job_description_id', type: 'uuid', nullable: true })
  jobDescriptionId: string | null;

  @Column({ name: 'job_description_version_id', type: 'uuid', nullable: true })
  jobDescriptionVersionId: string | null;

  @Column({ name: 'target_id', type: 'uuid', nullable: true })
  targetId: string | null;

  @ManyToOne(() => FacebookPublishTargetEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'target_id' })
  target: FacebookPublishTargetEntity | null;

  @Column({ name: 'extension_instance_id', type: 'uuid', nullable: true })
  extensionInstanceId: string | null;

  @ManyToOne(() => ExtensionInstanceEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'extension_instance_id' })
  extensionInstance: ExtensionInstanceEntity | null;

  @Column({ name: 'target_type', type: 'varchar' })
  targetType: FacebookPublishTargetType;

  @Column({ name: 'target_name', type: 'varchar' })
  targetName: string;

  @Column({ name: 'target_url', type: 'text', nullable: true })
  targetUrl: string | null;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'varchar', default: FacebookPublishResultStatus.PENDING })
  status: FacebookPublishResultStatus;

  @Column({
    name: 'facebook_review_status',
    type: 'varchar',
    default: FacebookReviewStatus.UNKNOWN,
  })
  facebookReviewStatus: FacebookReviewStatus;

  @Column({ type: 'text', nullable: true })
  message: string | null;

  @Column({ name: 'error_reason', type: 'text', nullable: true })
  errorReason: string | null;

  @Column({ name: 'external_post_id', type: 'varchar', nullable: true })
  externalPostId: string | null;

  @Column({ name: 'external_post_url', type: 'text', nullable: true })
  externalPostUrl: string | null;

  @Column({ name: 'submitted_at', type: 'timestamp', nullable: true })
  submittedAt: Date | null;

  @Column({ name: 'last_status_checked_at', type: 'timestamp', nullable: true })
  lastStatusCheckedAt: Date | null;

  @Column({ name: 'last_status_check_message', type: 'text', nullable: true })
  lastStatusCheckMessage: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
