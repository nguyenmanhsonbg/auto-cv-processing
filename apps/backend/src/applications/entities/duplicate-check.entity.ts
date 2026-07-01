import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import {
  DuplicateCheckStatus,
  DuplicateCheckType,
} from '../../recruitment-common/enums/recruitment.enum';
import { ApplicationEntity } from './application.entity';

@Entity('duplicate_checks')
@Index('IDX_duplicate_checks_application', ['applicationId'])
@Index('IDX_duplicate_checks_type_status', ['checkType', 'status'])
export class DuplicateCheckEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'application_id', type: 'uuid' })
  applicationId!: string;

  @ManyToOne(() => ApplicationEntity, (application) => application.duplicateChecks, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'application_id' })
  application!: ApplicationEntity;

  @Column({ name: 'check_type', type: 'varchar' })
  checkType!: DuplicateCheckType;

  @Column({ type: 'varchar' })
  status!: DuplicateCheckStatus;

  @Column({ name: 'matched_entity_type', type: 'varchar', nullable: true })
  matchedEntityType?: string | null;

  @Column({ name: 'matched_entity_id', type: 'varchar', nullable: true })
  matchedEntityId?: string | null;

  @Column({ type: 'numeric', nullable: true })
  score?: string | null;

  @Column({ type: 'jsonb', nullable: true })
  details?: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;
}
