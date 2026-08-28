import {
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserRole } from '@interview-assistant/shared';
import { UserRoleMembershipEntity } from './user-role-membership.entity';

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Index('UQ_users_amis_user_id', { unique: true })
  @Column({ name: 'amis_user_id', type: 'varchar', nullable: true })
  amisUserId: string | null;

  @Column({ name: 'amis_full_name', type: 'varchar', nullable: true })
  amisFullName: string | null;

  @Column({ name: 'amis_email', type: 'varchar', nullable: true })
  amisEmail: string | null;

  @Column({ name: 'amis_phone', type: 'varchar', nullable: true })
  amisPhone: string | null;

  @Column({ name: 'amis_tenant_id', type: 'varchar', nullable: true })
  amisTenantId: string | null;

  @Column({ name: 'amis_identity_verified_at', type: 'timestamp', nullable: true })
  amisIdentityVerifiedAt: Date | null;

  @Column()
  name: string;

  @Column()
  password: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.INTERVIEWER })
  role: UserRole;

  @Column({ name: 'must_change_password', default: false })
  mustChangePassword: boolean;

  @OneToMany(() => UserRoleMembershipEntity, (membership) => membership.user)
  roleMemberships: UserRoleMembershipEntity[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
