import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { FacebookPublishTargetType } from '../facebook-publishing.types';

@Entity('facebook_publish_targets')
@Index('IDX_facebook_publish_targets_type_active', ['type', 'active'])
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

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ type: 'integer', default: 0 })
  priority: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
