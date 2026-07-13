import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ExtensionInstanceEntity } from './extension-instance.entity';
import { ExtensionTaskEntity } from './extension-task.entity';

@Entity('extension_task_events')
@Index('IDX_extension_task_events_task_created', ['taskId', 'createdAt'])
@Index('IDX_extension_task_events_instance_created', ['instanceId', 'createdAt'])
export class ExtensionTaskEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'task_id', type: 'uuid' })
  taskId: string;

  @ManyToOne(() => ExtensionTaskEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'task_id' })
  task: ExtensionTaskEntity;

  @Column({ name: 'instance_id', type: 'uuid', nullable: true })
  instanceId: string | null;

  @ManyToOne(() => ExtensionInstanceEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'instance_id' })
  instance: ExtensionInstanceEntity | null;

  @Column({ name: 'event_type', type: 'varchar' })
  eventType: string;

  @Column({ type: 'text', nullable: true })
  message: string | null;

  @Column({ type: 'jsonb', nullable: true })
  payload: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}
