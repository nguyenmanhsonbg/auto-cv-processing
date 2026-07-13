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
  ExtensionCapability,
  ExtensionInstanceStatus,
} from '../enums/extension-integration.enum';

@Entity('extension_instances')
@Index('UQ_extension_instances_owner_install', ['ownerUserId', 'installId'], { unique: true })
@Index('IDX_extension_instances_owner_status', ['ownerUserId', 'status'])
@Index('IDX_extension_instances_last_seen_at', ['lastSeenAt'])
export class ExtensionInstanceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'owner_user_id', type: 'uuid' })
  ownerUserId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'owner_user_id' })
  ownerUser: UserEntity;

  @Column({ name: 'install_id', type: 'varchar' })
  installId: string;

  @Column({ name: 'display_name', type: 'varchar', nullable: true })
  displayName: string | null;

  @Column({ type: 'varchar', nullable: true })
  version: string | null;

  @Column({
    type: 'varchar',
    default: ExtensionInstanceStatus.ONLINE,
  })
  status: ExtensionInstanceStatus;

  @Column({ type: 'jsonb', nullable: true })
  capabilities: ExtensionCapability[] | null;

  @Column({ name: 'last_seen_at', type: 'timestamp', nullable: true })
  lastSeenAt: Date | null;

  @Column({ name: 'registered_at', type: 'timestamp' })
  registeredAt: Date;

  @Column({ name: 'disabled_at', type: 'timestamp', nullable: true })
  disabledAt: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
