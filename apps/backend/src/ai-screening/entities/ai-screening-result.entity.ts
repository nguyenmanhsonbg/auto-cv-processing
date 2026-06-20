import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AiScreeningRecommendation, AiScreeningStatus } from '../../recruitment-common';
import { ApplicationEntity } from '../../applications/entities/application.entity';
import { FormSessionEntity } from '../../form-sessions/entities/form-session.entity';
import { MappingResultEntity } from '../../mapping/entities/mapping-result.entity';

@Entity('ai_screening_results')
@Index('IDX_ai_screening_results_application', ['applicationId'])
@Index('UQ_ai_screening_results_done', ['applicationId', 'mappingResultId', 'formSessionId'], {
  unique: true,
  where: '"status" = \'DONE\'',
})
export class AiScreeningResultEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'application_id', type: 'uuid' })
  applicationId: string;

  @ManyToOne(() => ApplicationEntity, (application) => application.aiScreeningResults, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'application_id' })
  application: ApplicationEntity;

  @Column({ name: 'mapping_result_id', type: 'uuid' })
  mappingResultId: string;

  @ManyToOne(() => MappingResultEntity, (mappingResult) => mappingResult.aiScreeningResults, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'mapping_result_id' })
  mappingResult: MappingResultEntity;

  @Column({ name: 'form_session_id', type: 'uuid' })
  formSessionId: string;

  @ManyToOne(() => FormSessionEntity, (formSession) => formSession.aiScreeningResults, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'form_session_id' })
  formSession: FormSessionEntity;

  @Column({ name: 'final_score', type: 'numeric', nullable: true })
  finalScore: string | null;

  @Column({ type: 'varchar' })
  recommendation: AiScreeningRecommendation;

  @Column({ type: 'text', nullable: true })
  summary: string | null;

  @Column({ type: 'jsonb', nullable: true })
  strengths: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  gaps: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  risks: Record<string, unknown> | null;

  @Column({ type: 'varchar' })
  status: AiScreeningStatus;

  @Column({ type: 'varchar', nullable: true })
  model: string | null;

  @Column({ name: 'prompt_version', type: 'varchar', nullable: true })
  promptVersion: string | null;

  @Column({ name: 'raw_result', type: 'jsonb', nullable: true })
  rawResult: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}
