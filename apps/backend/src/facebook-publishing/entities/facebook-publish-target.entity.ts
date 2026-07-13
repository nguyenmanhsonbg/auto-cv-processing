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
import { ExtensionInstanceEntity } from '../../extension-integration/entities/extension-instance.entity';
import {
  FacebookPublishTargetEligibilityStatus,
  FacebookPublishTargetType,
} from '../facebook-publishing.types';

@Entity('facebook_publish_targets')
@Index('IDX_facebook_publish_targets_type_active', ['type', 'active'])
@Index('IDX_facebook_publish_targets_owner_type_active', ['ownerUserId', 'type', 'active'])
export class FacebookPublishTargetEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  type: FacebookPublishTargetType;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ name: 'external_id', type: 'varchar', nullable: true })
  externalId: string | null;

  @Column({ type: 'text', nullable: true })
  url: string | null;

  @Column({ name: 'owner_user_id', type: 'uuid', nullable: true })
  ownerUserId: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'owner_user_id' })
  ownerUser: UserEntity | null;

  @Column({ name: 'owner_extension_instance_id', type: 'uuid', nullable: true })
  ownerExtensionInstanceId: string | null;

  @ManyToOne(() => ExtensionInstanceEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'owner_extension_instance_id' })
  ownerExtensionInstance: ExtensionInstanceEntity | null;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({
    name: 'eligibility_status',
    type: 'varchar',
    default: FacebookPublishTargetEligibilityStatus.UNKNOWN,
  })
  eligibilityStatus: FacebookPublishTargetEligibilityStatus;

  @Column({ name: 'eligibility_reason', type: 'text', nullable: true })
  eligibilityReason: string | null;

  @Column({ name: 'last_verified_at', type: 'timestamp', nullable: true })
  lastVerifiedAt: Date | null;

  @Column({ name: 'last_verified_by_instance_id', type: 'uuid', nullable: true })
  lastVerifiedByInstanceId: string | null;

  @ManyToOne(() => ExtensionInstanceEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'last_verified_by_instance_id' })
  lastVerifiedByInstance: ExtensionInstanceEntity | null;

  @Column({ name: 'facebook_account_label', type: 'varchar', nullable: true })
  facebookAccountLabel: string | null;

  @Column({ name: 'daily_publish_limit', type: 'integer', default: 10 })
  dailyPublishLimit: number;

  @Column({ type: 'integer', default: 0 })
  priority: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
