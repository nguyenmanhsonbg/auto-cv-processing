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

@Entity('facebook_accounts')
@Index('UQ_facebook_accounts_owner_external', ['ownerUserId', 'facebookExternalId'], { unique: true })
@Index('IDX_facebook_accounts_owner_status', ['ownerUserId', 'status'])
export class FacebookAccountEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'owner_user_id', type: 'uuid' })
  ownerUserId: string;

  @ManyToOne(() => UserEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'owner_user_id' })
  ownerUser: UserEntity;

  // This is the stable Facebook identity, never the display name or email.
  @Column({ name: 'facebook_external_id', type: 'varchar', length: 255 })
  facebookExternalId: string;

  @Column({ name: 'display_name', type: 'varchar', length: 255, nullable: true })
  displayName: string | null;

  @Column({ name: 'profile_url', type: 'text', nullable: true })
  profileUrl: string | null;

  @Column({ type: 'varchar', length: 32, default: 'ACTIVE' })
  status: 'ACTIVE' | 'LOGGED_OUT' | 'UNKNOWN';

  @Column({ name: 'last_seen_at', type: 'timestamp', nullable: true })
  lastSeenAt: Date | null;

  @Column({ name: 'last_authenticated_at', type: 'timestamp', nullable: true })
  lastAuthenticatedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
