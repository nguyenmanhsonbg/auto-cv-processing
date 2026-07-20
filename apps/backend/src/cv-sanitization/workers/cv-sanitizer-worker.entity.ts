import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CvSanitizerWorkerStatus } from './cv-sanitizer-worker-status';

@Entity('cv_sanitizer_workers')
@Index('IDX_cv_sanitizer_workers_ready', ['status', 'readyAt'])
@Index('IDX_cv_sanitizer_workers_stale_lease', ['status', 'leaseExpiresAt'], {
  where: '"lease_expires_at" IS NOT NULL',
})
@Index('IDX_cv_sanitizer_workers_runtime_container', ['runtimeContainerId'], {
  where: '"runtime_container_id" IS NOT NULL',
})
@Index('UQ_cv_sanitizer_workers_current_job', ['currentJobId'], {
  unique: true,
  where: '"current_job_id" IS NOT NULL',
})
@Index('IDX_cv_sanitizer_workers_capacity', ['status', 'createdAt'])
export class CvSanitizerWorkerEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'runtime_type', type: 'varchar' })
  runtimeType: string;

  @Column({ name: 'runtime_container_id', type: 'varchar', nullable: true })
  runtimeContainerId: string | null;

  @Column({ name: 'runtime_container_name', type: 'varchar', nullable: true })
  runtimeContainerName: string | null;

  @Column({ type: 'varchar', default: CvSanitizerWorkerStatus.STARTING })
  status: CvSanitizerWorkerStatus;

  @Column({ name: 'current_job_id', type: 'uuid', nullable: true })
  currentJobId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @Column({ name: 'ready_at', type: 'timestamp', nullable: true })
  readyAt: Date | null;

  @Column({ name: 'reserved_at', type: 'timestamp', nullable: true })
  reservedAt: Date | null;

  @Column({ name: 'started_at', type: 'timestamp', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'terminated_at', type: 'timestamp', nullable: true })
  terminatedAt: Date | null;

  @Column({ name: 'last_heartbeat_at', type: 'timestamp', nullable: true })
  lastHeartbeatAt: Date | null;

  @Column({ name: 'lease_expires_at', type: 'timestamp', nullable: true })
  leaseExpiresAt: Date | null;

  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason: string | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
