import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  AiScreeningStatus,
  ApplicationSourceType,
  ApplicationStatus,
  FormSessionStatus,
  HrReviewDecisionType,
  MappingStatus,
  RecruitmentChannel,
} from '../../recruitment-common';
import { AuditLogEntity } from '../../audit-logs/entities/audit-log.entity';
import { AiScreeningResultEntity } from '../../ai-screening/entities/ai-screening-result.entity';
import { CandidateEntity } from '../../candidates/entities/candidate.entity';
import { CvDocumentEntity } from '../../cv-documents/entities/cv-document.entity';
import { ParsedProfileEntity } from '../../cv-documents/entities/parsed-profile.entity';
import { FormAnswerEntity } from '../../form-sessions/entities/form-answer.entity';
import { FormSessionEntity } from '../../form-sessions/entities/form-session.entity';
import { HrReviewDecisionEntity } from '../../hr-review/entities/hr-review-decision.entity';
import { JobDescriptionVersionEntity } from '../../job-descriptions/entities/job-description-version.entity';
import { JobPostingEntity } from '../../job-postings/entities/job-posting.entity';
import { MappingResultEntity } from '../../mapping/entities/mapping-result.entity';
import { WorkflowEventEntity } from '../../workflow-state/entities/workflow-event.entity';
import { ApplicationSourceEntity } from './application-source.entity';

@Entity('applications')
@Index('IDX_applications_status', ['status'])
@Index('IDX_applications_candidate', ['candidateId'])
@Index('IDX_applications_job_posting', ['jobPostingId'])
@Index('IDX_applications_jd_version', ['jobDescriptionVersionId'])
@Index('UQ_applications_candidate_job_posting', ['candidateId', 'jobPostingId'], {
  unique: true,
})
@Index('IDX_applications_external', ['sourceChannel', 'externalApplicationId'], {
  where: '"external_application_id" IS NOT NULL',
})
export class ApplicationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'candidate_id', type: 'uuid' })
  candidateId: string;

  @ManyToOne(() => CandidateEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'candidate_id' })
  candidate: CandidateEntity;

  @Column({ name: 'job_posting_id', type: 'uuid' })
  jobPostingId: string;

  @ManyToOne(() => JobPostingEntity, (jobPosting) => jobPosting.applications, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'job_posting_id' })
  jobPosting: JobPostingEntity;

  @Column({ name: 'job_description_version_id', type: 'uuid' })
  jobDescriptionVersionId: string;

  @ManyToOne(() => JobDescriptionVersionEntity, (version) => version.applications, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'job_description_version_id' })
  jobDescriptionVersion: JobDescriptionVersionEntity;

  @Column({ type: 'varchar' })
  source: ApplicationSourceType;

  @Column({ name: 'source_channel', type: 'varchar', nullable: true })
  sourceChannel: RecruitmentChannel | null;

  @Column({ name: 'external_application_id', type: 'varchar', nullable: true })
  externalApplicationId: string | null;

  @Column({
    type: 'varchar',
    default: ApplicationStatus.APPLICATION_CREATED,
  })
  status: ApplicationStatus;

  @Column({ name: 'current_cv_document_id', type: 'uuid', nullable: true })
  currentCvDocumentId: string | null;

  @ManyToOne(() => CvDocumentEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'current_cv_document_id' })
  currentCvDocument: CvDocumentEntity | null;

  @OneToMany(() => CvDocumentEntity, (cvDocument) => cvDocument.application)
  cvDocuments: CvDocumentEntity[];

  @OneToMany(() => ParsedProfileEntity, (parsedProfile) => parsedProfile.application)
  parsedProfiles: ParsedProfileEntity[];

  @OneToMany(() => MappingResultEntity, (mappingResult) => mappingResult.application)
  mappingResults: MappingResultEntity[];

  @OneToMany(() => FormSessionEntity, (formSession) => formSession.application)
  formSessions: FormSessionEntity[];

  @OneToMany(() => FormAnswerEntity, (formAnswer) => formAnswer.application)
  formAnswers: FormAnswerEntity[];

  @OneToMany(() => AiScreeningResultEntity, (aiResult) => aiResult.application)
  aiScreeningResults: AiScreeningResultEntity[];

  @OneToMany(() => HrReviewDecisionEntity, (hrReview) => hrReview.application)
  hrReviews: HrReviewDecisionEntity[];

  @OneToMany(() => WorkflowEventEntity, (workflowEvent) => workflowEvent.application)
  workflowEvents: WorkflowEventEntity[];

  @OneToMany(() => AuditLogEntity, (auditLog) => auditLog.application)
  auditLogs: AuditLogEntity[];

  @OneToMany(() => ApplicationSourceEntity, (source) => source.application)
  sources: ApplicationSourceEntity[];

  @Column({ name: 'mapping_status', type: 'varchar', nullable: true })
  mappingStatus: MappingStatus | null;

  @Column({ name: 'form_status', type: 'varchar', nullable: true })
  formStatus: FormSessionStatus | null;

  @Column({ name: 'ai_screening_status', type: 'varchar', nullable: true })
  aiScreeningStatus: AiScreeningStatus | null;

  @Column({ name: 'hr_review_status', type: 'varchar', nullable: true })
  hrReviewStatus: HrReviewDecisionType | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
