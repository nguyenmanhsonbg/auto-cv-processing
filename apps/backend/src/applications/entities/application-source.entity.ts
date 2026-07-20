import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ApplicationSourceType, RecruitmentChannel } from '../../recruitment-common';
import { ApplicationEntity } from './application.entity';

@Entity('application_sources')
@Index('UQ_application_sources_external', ['channel', 'externalApplicationId'], {
  unique: true,
  where: '"channel" IS NOT NULL AND "external_application_id" IS NOT NULL',
})
@Index('IDX_application_sources_lead', ['externalLeadId'], {
  where: '"external_lead_id" IS NOT NULL',
})
export class ApplicationSourceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'application_id', type: 'uuid' })
  applicationId: string;

  @ManyToOne(() => ApplicationEntity, (application) => application.sources, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'application_id' })
  application: ApplicationEntity;

  @Column({ name: 'source_type', type: 'varchar' })
  sourceType: ApplicationSourceType;

  @Column({ type: 'varchar', nullable: true })
  channel: RecruitmentChannel | null;

  @Column({ name: 'external_lead_id', type: 'varchar', nullable: true })
  externalLeadId: string | null;

  @Column({ name: 'external_application_id', type: 'varchar', nullable: true })
  externalApplicationId: string | null;

  @Column({ name: 'amis_candidate_id', type: 'varchar', nullable: true })
  amisCandidateId: string | null;

  @Column({ name: 'raw_payload', type: 'jsonb', nullable: true })
  rawPayload: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'received_at', type: 'timestamp' })
  receivedAt: Date;
}
