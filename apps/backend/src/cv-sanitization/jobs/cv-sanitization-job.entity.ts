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
import { ApplicationEntity } from '../../applications/entities/application.entity';
import { CvDocumentEntity } from '../../cv-documents/entities/cv-document.entity';
import { CvSanitizationJobStatus } from './cv-sanitization-job-status';

@Entity('cv_sanitization_jobs')
@Index('IDX_cv_sanitization_jobs_queue', ['status', 'queuedAt'])
@Index('IDX_cv_sanitization_jobs_application_cv', ['applicationId', 'originalCvDocumentId'])
@Index('IDX_cv_sanitization_jobs_stale_lease', ['status', 'leaseExpiresAt'], {
  where: '"lease_expires_at" IS NOT NULL',
})
@Index('IDX_cv_sanitization_jobs_worker', ['workerId'], {
  where: '"worker_id" IS NOT NULL',
})
@Index('UQ_cv_sanitization_jobs_active_input', ['applicationId', 'originalCvDocumentId', 'inputHash'], {
  unique: true,
  where: `"status" IN ('QUEUED', 'ASSIGNED', 'PROCESSING', 'RETRY_PENDING')`,
})
export class CvSanitizationJobEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'application_id', type: 'uuid' })
  applicationId: string;

  @ManyToOne(() => ApplicationEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'application_id' })
  application: ApplicationEntity;

  @Column({ name: 'original_cv_document_id', type: 'uuid' })
  originalCvDocumentId: string;

  @ManyToOne(() => CvDocumentEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'original_cv_document_id' })
  originalCvDocument: CvDocumentEntity;

  @Column({ name: 'clean_cv_document_id', type: 'uuid', nullable: true })
  cleanCvDocumentId: string | null;

  @ManyToOne(() => CvDocumentEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'clean_cv_document_id' })
  cleanCvDocument: CvDocumentEntity | null;

  @Column({ name: 'worker_id', type: 'uuid', nullable: true })
  workerId: string | null;

  @Column({ type: 'varchar', default: CvSanitizationJobStatus.QUEUED })
  status: CvSanitizationJobStatus;

  @Column({ type: 'integer', default: 0 })
  attempt: number;

  @Column({ name: 'max_attempts', type: 'integer', default: 2 })
  maxAttempts: number;

  @Column({ name: 'input_hash', type: 'varchar' })
  inputHash: string;

  @Column({ name: 'source_file_path', type: 'text' })
  sourceFilePath: string;

  @Column({ name: 'source_storage_path', type: 'text' })
  sourceStoragePath: string;

  @Column({ name: 'source_mime_type', type: 'varchar' })
  sourceMimeType: string;

  @Column({ name: 'output_file_path', type: 'text' })
  outputFilePath: string;

  @Column({ name: 'output_storage_path', type: 'text' })
  outputStoragePath: string;

  @Column({ name: 'output_hash', type: 'varchar', nullable: true })
  outputHash: string | null;

  @Column({ name: 'error_code', type: 'varchar', nullable: true })
  errorCode: string | null;

  @Column({ name: 'error_message_safe', type: 'text', nullable: true })
  errorMessageSafe: string | null;

  @Column({ name: 'container_exit_code', type: 'integer', nullable: true })
  containerExitCode: number | null;

  @CreateDateColumn({ name: 'queued_at', type: 'timestamp' })
  queuedAt: Date;

  @Column({ name: 'assigned_at', type: 'timestamp', nullable: true })
  assignedAt: Date | null;

  @Column({ name: 'started_at', type: 'timestamp', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'finished_at', type: 'timestamp', nullable: true })
  finishedAt: Date | null;

  @Column({ name: 'lease_expires_at', type: 'timestamp', nullable: true })
  leaseExpiresAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
