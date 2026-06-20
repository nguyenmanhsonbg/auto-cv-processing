import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ApplicationStatus } from '../../recruitment-common';
import { ApplicationEntity } from '../../applications/entities/application.entity';

@Entity('workflow_events')
@Index('IDX_workflow_events_timeline', ['applicationId', 'createdAt'])
export class WorkflowEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'application_id', type: 'uuid' })
  applicationId: string;

  @ManyToOne(() => ApplicationEntity, (application) => application.workflowEvents, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'application_id' })
  application: ApplicationEntity;

  @Column({ name: 'from_status', type: 'varchar', nullable: true })
  fromStatus: ApplicationStatus | null;

  @Column({ name: 'to_status', type: 'varchar' })
  toStatus: ApplicationStatus;

  @Column({ name: 'event_type', type: 'varchar' })
  eventType: string;

  @Column({ name: 'actor_type', type: 'varchar' })
  actorType: string;

  @Column({ name: 'actor_id', type: 'varchar', nullable: true })
  actorId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}
