import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ApplicationEntity } from '../../applications/entities/application.entity';
import { FreelancerEntity } from './freelancer.entity';

@Entity('application_referrals')
@Index('UQ_application_referrals_application_id', ['applicationId'], { unique: true })
@Index('IDX_application_referrals_freelancer_id', ['freelancerId'])
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

  @Column({ name: 'freelancer_id', type: 'uuid' })
  freelancerId: string;

  @ManyToOne(() => FreelancerEntity, (freelancer) => freelancer.referrals, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'freelancer_id' })
  freelancer: FreelancerEntity;

  @Column({ type: 'text', nullable: true })
  evaluation: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
