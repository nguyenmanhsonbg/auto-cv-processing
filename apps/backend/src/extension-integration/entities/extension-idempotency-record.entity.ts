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
  ExtensionIdempotencyStatus,
  ExtensionSourceSystem,
} from '../enums/extension-integration.enum';

@Entity('extension_idempotency_records')
@Index('UQ_extension_idempotency_records_key', ['idempotencyKey'], { unique: true })
@Index('IDX_extension_idempotency_records_source_key', ['sourceSystem', 'idempotencyKey'])
@Index('IDX_extension_idempotency_records_status', ['status'])
export class ExtensionIdempotencyRecordEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'idempotency_key', type: 'varchar' })
  idempotencyKey: string;

  @Column({ name: 'source_system', type: 'varchar' })
  sourceSystem: ExtensionSourceSystem;

  @Column({ name: 'request_hash', type: 'varchar' })
  requestHash: string;

  @Column({
    type: 'varchar',
    default: ExtensionIdempotencyStatus.PROCESSING,
  })
  status: ExtensionIdempotencyStatus;

  @Column({ name: 'response_data', type: 'jsonb', nullable: true })
  responseData: Record<string, unknown> | null;

  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'actor_user_id' })
  actorUser: UserEntity | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
