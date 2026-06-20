import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ApplicationEntity } from '../../applications/entities/application.entity';

@Entity('audit_logs')
@Index('IDX_audit_logs_application', ['applicationId', 'createdAt'])
@Index('IDX_audit_logs_actor', ['actorType', 'actorId', 'createdAt'])
@Index('IDX_audit_logs_object', ['objectType', 'objectId'])
export class AuditLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'actor_type', type: 'varchar' })
  actorType: string;

  @Column({ name: 'actor_id', type: 'varchar', nullable: true })
  actorId: string | null;

  @Column({ type: 'varchar' })
  action: string;

  @Column({ name: 'object_type', type: 'varchar' })
  objectType: string;

  @Column({ name: 'object_id', type: 'varchar', nullable: true })
  objectId: string | null;

  @Column({ name: 'application_id', type: 'uuid', nullable: true })
  applicationId: string | null;

  @ManyToOne(() => ApplicationEntity, (application) => application.auditLogs, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'application_id' })
  application: ApplicationEntity | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ name: 'ip_address', type: 'varchar', nullable: true })
  ipAddress: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}
