import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ExtensionSourceSystem } from '../enums';

@Entity('amis_recruitment_board_members')
@Index('UQ_amis_recruitment_board_members_source_user', [
  'sourceSystem',
  'amisRecruitmentId',
  'amisUserId',
], { unique: true })
@Index('IDX_amis_recruitment_board_members_recruitment_active', [
  'sourceSystem',
  'amisRecruitmentId',
  'isActive',
])
export class AmisRecruitmentBoardMemberEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'source_system', type: 'varchar', default: ExtensionSourceSystem.AMIS })
  sourceSystem: ExtensionSourceSystem;

  @Column({ name: 'amis_recruitment_id', type: 'varchar' })
  amisRecruitmentId: string;

  @Column({ name: 'amis_board_id', type: 'varchar', nullable: true })
  amisBoardId: string | null;

  @Column({ name: 'amis_user_id', type: 'varchar' })
  amisUserId: string;

  @Column({ name: 'full_name', type: 'varchar' })
  fullName: string;

  @Column({ type: 'varchar', nullable: true })
  email: string | null;

  @Column({ name: 'is_admin', type: 'boolean', default: false })
  isAdmin: boolean;

  @Column({ name: 'is_view_offer', type: 'boolean', default: false })
  isViewOffer: boolean;

  @Column({ name: 'is_push_notification', type: 'boolean', default: false })
  isPushNotification: boolean;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'source_url', type: 'text', nullable: true })
  sourceUrl: string | null;

  @Column({ name: 'last_synced_at', type: 'timestamp' })
  lastSyncedAt: Date;

  @Column({ name: 'revoked_at', type: 'timestamp', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
