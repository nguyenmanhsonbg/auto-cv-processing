import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { MappingRecommendation, MappingStatus } from '../../recruitment-common';
import { AiScreeningResultEntity } from '../../ai-screening/entities/ai-screening-result.entity';
import { ApplicationEntity } from '../../applications/entities/application.entity';
import { CvDocumentEntity } from '../../cv-documents/entities/cv-document.entity';
import { ParsedProfileEntity } from '../../cv-documents/entities/parsed-profile.entity';
import { JobDescriptionVersionEntity } from '../../job-descriptions/entities/job-description-version.entity';

@Entity('mapping_results')
@Index('IDX_mapping_results_application', ['applicationId'])
@Index('UQ_mapping_results_done', ['applicationId', 'cleanCvDocumentId', 'jobDescriptionVersionId'], {
  unique: true,
  where: '"status" = \'DONE\'',
})
export class MappingResultEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'application_id', type: 'uuid' })
  applicationId: string;

  @ManyToOne(() => ApplicationEntity, (application) => application.mappingResults, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'application_id' })
  application: ApplicationEntity;

  @Column({ name: 'job_description_version_id', type: 'uuid' })
  jobDescriptionVersionId: string;

  @ManyToOne(() => JobDescriptionVersionEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'job_description_version_id' })
  jobDescriptionVersion: JobDescriptionVersionEntity;

  @Column({ name: 'clean_cv_document_id', type: 'uuid' })
  cleanCvDocumentId: string;

  @ManyToOne(() => CvDocumentEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'clean_cv_document_id' })
  cleanCvDocument: CvDocumentEntity;

  @Column({ name: 'parsed_profile_id', type: 'uuid', nullable: true })
  parsedProfileId: string | null;

  @ManyToOne(() => ParsedProfileEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'parsed_profile_id' })
  parsedProfile: ParsedProfileEntity | null;

  @Column({ type: 'numeric' })
  score: string;

  @Column({ type: 'jsonb', nullable: true })
  strengths: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  gaps: Record<string, unknown> | null;

  @Column({ type: 'varchar' })
  recommendation: MappingRecommendation;

  @Column({ type: 'varchar' })
  status: MappingStatus;

  @Column({ name: 'model_version', type: 'varchar', nullable: true })
  modelVersion: string | null;

  @Column({ type: 'jsonb', nullable: true })
  evidence: Record<string, unknown> | null;

  @OneToMany(() => AiScreeningResultEntity, (aiResult) => aiResult.mappingResult)
  aiScreeningResults: AiScreeningResultEntity[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}
