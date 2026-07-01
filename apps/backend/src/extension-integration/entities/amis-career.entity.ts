import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('amis_careers')
@Index('UQ_amis_careers_amis_career_id', ['amisCareerId'], { unique: true })
@Index('IDX_amis_careers_parent_amis_career_id', ['parentAmisCareerId'])
@Index('IDX_amis_careers_name', ['name'])
export class AmisCareerEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'amis_career_id', type: 'varchar' })
  amisCareerId: string;

  @Column({ name: 'code', type: 'varchar', nullable: true })
  code: string | null;

  @Column({ name: 'name', type: 'varchar' })
  name: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'organization_unit_id', type: 'uuid', nullable: true })
  organizationUnitId: string | null;

  @Column({ name: 'organization_unit_name', type: 'varchar', nullable: true })
  organizationUnitName: string | null;

  @Column({ name: 'usage_status', type: 'integer', nullable: true })
  usageStatus: number | null;

  @Column({ name: 'parent_amis_career_id', type: 'varchar', nullable: true })
  parentAmisCareerId: string | null;

  @Column({ name: 'sort_order', type: 'integer', nullable: true })
  sortOrder: number | null;

  @Column({ name: 'question_category_names', type: 'jsonb', nullable: true })
  questionCategoryNames: string[] | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'removed_from_amis_at', type: 'timestamp', nullable: true })
  removedFromAmisAt: Date | null;

  @Column({ name: 'raw_snapshot', type: 'jsonb', nullable: true })
  rawSnapshot: Record<string, unknown> | null;

  @Column({ name: 'last_synced_at', type: 'timestamp' })
  lastSyncedAt: Date;

  @Column({ name: 'last_synced_by_id', type: 'uuid', nullable: true })
  lastSyncedById: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
