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
import { JobPostingEntity } from '../../job-postings/entities/job-posting.entity';
import {
  ExtensionExternalEntityType,
  ExtensionInternalEntityType,
  ExtensionSourceSystem,
} from '../enums/extension-integration.enum';

@Entity('recruitment_external_references')
@Index(
  'UQ_recruitment_external_references_external',
  ['sourceSystem', 'externalEntityType', 'externalId'],
  { unique: true },
)
@Index('IDX_recruitment_external_references_internal', [
  'internalEntityType',
  'internalEntityId',
])
@Index('IDX_recruitment_external_references_source_external_id', [
  'sourceSystem',
  'externalId',
])
export class RecruitmentExternalReferenceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'source_system', type: 'varchar' })
  sourceSystem: ExtensionSourceSystem;

  @Column({ name: 'external_entity_type', type: 'varchar' })
  externalEntityType: ExtensionExternalEntityType;

  @Column({ name: 'external_id', type: 'varchar' })
  externalId: string;

  @Column({ name: 'external_url', type: 'text', nullable: true })
  externalUrl: string | null;

  @Column({ name: 'internal_entity_type', type: 'varchar' })
  internalEntityType: ExtensionInternalEntityType;

  @Column({ name: 'internal_entity_id', type: 'uuid' })
  internalEntityId: string;

  @ManyToOne(() => JobPostingEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'internal_entity_id' })
  jobPosting: JobPostingEntity;

  @Column({ name: 'last_snapshot_hash', type: 'varchar', nullable: true })
  lastSnapshotHash: string | null;

  @Column({ name: 'last_idempotency_key', type: 'varchar', nullable: true })
  lastIdempotencyKey: string | null;

  @Column({ name: 'last_synced_at', type: 'timestamp', nullable: true })
  lastSyncedAt: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
