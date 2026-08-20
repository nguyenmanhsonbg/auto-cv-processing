import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ExtensionSourceSystem } from '../enums';

@Entity('amis_recruitment_rounds')
@Index('UQ_amis_recruitment_rounds_source_round', [
  'sourceSystem',
  'amisRecruitmentId',
  'amisRoundId',
], { unique: true })
@Index('IDX_amis_recruitment_rounds_recruitment', [
  'sourceSystem',
  'amisRecruitmentId',
  'isActive',
  'sortOrder',
])
export class AmisRecruitmentRoundEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'source_system', type: 'varchar', default: ExtensionSourceSystem.AMIS })
  sourceSystem: ExtensionSourceSystem;

  @Column({ name: 'amis_recruitment_id', type: 'varchar' })
  amisRecruitmentId: string;

  @Column({ name: 'amis_round_id', type: 'varchar' })
  amisRoundId: string;

  @Column({ name: 'round_name', type: 'varchar' })
  roundName: string;

  @Column({ name: 'sort_order', type: 'integer' })
  sortOrder: number;

  @Column({ name: 'round_type', type: 'integer', nullable: true })
  roundType: number | null;

  @Column({ name: 'round_type_id', type: 'varchar', nullable: true })
  roundTypeId: string | null;

  @Column({ type: 'varchar', nullable: true })
  color: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'source_url', type: 'text', nullable: true })
  sourceUrl: string | null;

  @Column({ name: 'last_synced_at', type: 'timestamp' })
  lastSyncedAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
