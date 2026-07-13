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
import { UserEntity } from '../../auth/entities/user.entity';
import {
  ExtensionTaskStatus,
  ExtensionTaskType,
} from '../enums/extension-integration.enum';
import { ExtensionInstanceEntity } from './extension-instance.entity';

@Entity('extension_tasks')
@Index('IDX_extension_tasks_status_priority_created', ['status', 'priority', 'createdAt'])
@Index('IDX_extension_tasks_assigned_status', ['assignedInstanceId', 'status'])
@Index('IDX_extension_tasks_claimed_status', ['claimedByInstanceId', 'status'])
@Index('IDX_extension_tasks_locked_until', ['lockedUntil'])
export class ExtensionTaskEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  type: ExtensionTaskType;

  @Column({
    type: 'varchar',
    default: ExtensionTaskStatus.PENDING,
  })
  status: ExtensionTaskStatus;

  @Column({ name: 'requested_by_user_id', type: 'uuid' })
  requestedByUserId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'requested_by_user_id' })
  requestedByUser: UserEntity;

  @Column({ name: 'assigned_instance_id', type: 'uuid', nullable: true })
  assignedInstanceId: string | null;

  @ManyToOne(() => ExtensionInstanceEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assigned_instance_id' })
  assignedInstance: ExtensionInstanceEntity | null;

  @Column({ name: 'claimed_by_instance_id', type: 'uuid', nullable: true })
  claimedByInstanceId: string | null;

  @ManyToOne(() => ExtensionInstanceEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'claimed_by_instance_id' })
  claimedInstance: ExtensionInstanceEntity | null;

  @Column({ name: 'locked_until', type: 'timestamp', nullable: true })
  lockedUntil: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  payload: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  result: Record<string, unknown> | null;

  @Column({ name: 'error_code', type: 'varchar', nullable: true })
  errorCode: string | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'attempt_count', type: 'integer', default: 0 })
  attemptCount: number;

  @Column({ name: 'max_attempts', type: 'integer', default: 3 })
  maxAttempts: number;

  @Column({ type: 'integer', default: 0 })
  priority: number;

  @Column({ name: 'started_at', type: 'timestamp', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'finished_at', type: 'timestamp', nullable: true })
  finishedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
