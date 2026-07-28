import {
  Column,
  CreateDateColumn,
  Entity,
  Check,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ApplicationEntity } from '../../applications/entities/application.entity';
import { ApplicationReferralSourceType } from '../../internals/internals.types';
import { InternalEntity } from '../../internals/entities/internal.entity';
import { FreelancerEntity } from './freelancer.entity';

@Entity('application_referrals')
@Check(
  'CHK_application_referrals_source_owner',
  `("source_type" = 'FREELANCER' AND "freelancer_id" IS NOT NULL AND "internal_id" IS NULL) OR ("source_type" = 'INTERNAL' AND "freelancer_id" IS NULL AND "internal_id" IS NOT NULL)`,
)
@Index('UQ_application_referrals_application_id', ['applicationId'], { unique: true })
@Index('IDX_application_referrals_freelancer_id', ['freelancerId'])
@Index('IDX_application_referrals_internal_id', ['internalId'])
export class ApplicationReferralEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'application_id', type: 'uuid' })
  applicationId: string;

  @OneToOne(() => ApplicationEntity, (application) => application.freelancerReferral, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'application_id' })
  application: ApplicationEntity;

  @Column({ name: 'source_type', type: 'varchar', length: 20, default: ApplicationReferralSourceType.FREELANCER })
  sourceType: ApplicationReferralSourceType;

  @Column({ name: 'freelancer_id', type: 'uuid', nullable: true })
  freelancerId: string | null;

  @ManyToOne(() => FreelancerEntity, (freelancer) => freelancer.referrals, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'freelancer_id' })
  freelancer: FreelancerEntity | null;

  @Column({ name: 'internal_id', type: 'uuid', nullable: true })
  internalId: string | null;

  @ManyToOne(() => InternalEntity, (internal) => internal.referrals, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'internal_id' })
  internal: InternalEntity | null;

  @Column({ type: 'text', nullable: true })
  evaluation: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
