import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { HrReviewDecisionType } from '../../recruitment-common';
import { ApplicationEntity } from '../../applications/entities/application.entity';
import { UserEntity } from '../../auth/entities/user.entity';

@Entity('hr_reviews')
@Index('IDX_hr_reviews_application', ['applicationId'])
@Index('IDX_hr_reviews_timeline', ['applicationId', 'createdAt'])
export class HrReviewDecisionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'application_id', type: 'uuid' })
  applicationId: string;

  @ManyToOne(() => ApplicationEntity, (application) => application.hrReviews, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'application_id' })
  application: ApplicationEntity;

  @Column({ name: 'reviewer_id', type: 'uuid' })
  reviewerId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'reviewer_id' })
  reviewer: UserEntity;

  @Column({ type: 'varchar' })
  decision: HrReviewDecisionType;

  @Column({ type: 'text', nullable: true })
  comment: string | null;

  @Column({ name: 'reason_codes', type: 'jsonb', nullable: true })
  reasonCodes: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}
