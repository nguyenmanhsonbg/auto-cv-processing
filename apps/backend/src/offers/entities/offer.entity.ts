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
import { OfferStatus, ContractType } from '../../recruitment-common';
import { ApplicationEntity } from '../../applications/entities/application.entity';
import { UserEntity } from '../../auth/entities/user.entity';

@Entity('offers')
@Index('IDX_offers_application', ['applicationId'])
@Index('IDX_offers_status', ['status'])
@Index('UQ_offers_application_version', ['applicationId', 'version'], { unique: true })
export class OfferEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'application_id', type: 'uuid' })
  applicationId: string;

  @ManyToOne(() => ApplicationEntity, (application) => application.offers, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'application_id' })
  application: ApplicationEntity;

  @Column({ type: 'integer', default: 1 })
  version: number;

  @Column({ name: 'previous_offer_id', type: 'uuid', nullable: true })
  previousOfferId: string | null;

  @ManyToOne(() => OfferEntity, { nullable: true })
  @JoinColumn({ name: 'previous_offer_id' })
  previousOffer: OfferEntity | null;

  @Column({ type: 'varchar' })
  status: OfferStatus;

  // Thông tin offer
  @Column({ name: 'job_title', type: 'varchar' })
  jobTitle: string;

  @Column({ name: 'department', type: 'varchar', nullable: true })
  department: string | null;

  @Column({ name: 'level', type: 'varchar', nullable: true })
  level: string | null;

  @Column({ name: 'gross_salary', type: 'decimal', precision: 12, scale: 2, nullable: true })
  grossSalary: number | null;

  @Column({ name: 'start_date', type: 'date', nullable: true })
  startDate: string | null;

  @Column({ name: 'contract_type', type: 'varchar', nullable: true })
  contractType: ContractType | null;

  @Column({ name: 'work_location', type: 'varchar', nullable: true })
  workLocation: string | null;

  @Column({ type: 'jsonb', nullable: true })
  benefits: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  // Timeline
  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt: Date | null;

  @Column({ name: 'responded_at', type: 'timestamptz', nullable: true })
  respondedAt: Date | null;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @Column({ name: 'hr_created_by_id', type: 'uuid' })
  hrCreatedById: string;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'hr_created_by_id' })
  hrCreatedBy: UserEntity;

  @Column({ name: 'external_offer_id', type: 'varchar', nullable: true })
  externalOfferId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
