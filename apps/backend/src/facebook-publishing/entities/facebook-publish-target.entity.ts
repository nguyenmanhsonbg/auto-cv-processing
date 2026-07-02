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
import { FacebookPublishTargetType } from '../facebook-publishing.types';

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

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ type: 'integer', default: 0 })
  priority: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
