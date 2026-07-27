import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserEntity } from '../../auth/entities/user.entity';
import { ApplicationReferralEntity } from './application-referral.entity';

@Entity('freelancers')
@Check('CHK_freelancers_identifier_format', `"identifier" ~ '^FL[0-9]{6}$'`)
@Index('UQ_freelancers_user_id', ['userId'], { unique: true })
@Index('UQ_freelancers_identifier', ['identifier'], { unique: true })
@Index('IDX_freelancers_is_active', ['isActive'])
export class FreelancerEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @OneToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @Column({ type: 'varchar', length: 8, update: false })
  identifier: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'created_by_id', type: 'uuid' })
  createdById: string;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by_id' })
  createdBy: UserEntity;

  @OneToMany(() => ApplicationReferralEntity, (applicationReferral) => applicationReferral.freelancer)
  referrals: ApplicationReferralEntity[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
