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
import { UserEntity } from '../../auth/entities/user.entity';

@Entity('amis_hr_mappings')
@Index('UQ_amis_hr_mappings_account', ['amisAccountId'], { unique: true })
@Index('IDX_amis_hr_mappings_hr_user', ['hrUserId'])
export class AmisHrMappingEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'amis_account_id', type: 'varchar' })
  amisAccountId: string;

  @Column({ name: 'amis_account_name', type: 'varchar', nullable: true })
  amisAccountName: string | null;

  @Column({ name: 'hr_user_id', type: 'uuid' })
  hrUserId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT', eager: false })
  @JoinColumn({ name: 'hr_user_id' })
  hrUser: UserEntity;

  @Column({ name: 'hr_email', type: 'varchar' })
  hrEmail: string;

  @Column({ name: 'hr_name', type: 'varchar', nullable: true })
  hrName: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
