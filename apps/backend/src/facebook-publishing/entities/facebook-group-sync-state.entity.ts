import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

export type FacebookGroupSyncStateStatus = 'NOT_INITIALIZED' | 'SYNCING' | 'READY' | 'PARTIAL' | 'FAILED';

@Entity('facebook_group_sync_states')
@Unique('UQ_facebook_group_sync_states_owner_scope', ['ownerUserId', 'scopeKey'])
@Index('IDX_facebook_group_sync_states_owner_scope', ['ownerUserId', 'scopeKey'])
export class FacebookGroupSyncStateEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'owner_user_id', type: 'uuid' })
  ownerUserId: string;

  @Column({ name: 'scope_key', type: 'varchar', length: 255 })
  scopeKey: string;

  @Column({ type: 'varchar', length: 32, default: 'NOT_INITIALIZED' })
  status: FacebookGroupSyncStateStatus;

  @Column({ name: 'initial_scan_completed_at', type: 'timestamp', nullable: true })
  initialScanCompletedAt: Date | null;

  @Column({ name: 'last_scan_started_at', type: 'timestamp', nullable: true })
  lastScanStartedAt: Date | null;

  @Column({ name: 'last_scan_completed_at', type: 'timestamp', nullable: true })
  lastScanCompletedAt: Date | null;

  @Column({ name: 'last_scanned_count', type: 'integer', default: 0 })
  lastScannedCount: number;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
