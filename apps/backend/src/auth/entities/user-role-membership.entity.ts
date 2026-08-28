import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { UserRole } from '@interview-assistant/shared';
import { UserEntity } from './user.entity';

@Entity('user_role_memberships')
@Index('UQ_user_role_memberships_user_role', ['userId', 'role'], { unique: true })
@Index('IDX_user_role_memberships_role', ['role'])
export class UserRoleMembershipEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ type: 'enum', enum: UserRole })
  role: UserRole;

  @ManyToOne(() => UserEntity, (user) => user.roleMemberships, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}
