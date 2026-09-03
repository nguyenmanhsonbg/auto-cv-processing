import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  AiScreeningStatus,
  ApplicationSourceType,
  ApplicationStatus,
  ApplicationStage,
  FormSessionStatus,
  HrReviewDecisionType,
  MappingStatus,
  RecruitmentChannel,
  OfferStatus,
  OnboardingStatus,
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
import { ApplicationReferralEntity } from '../../freelancers/entities/application-referral.entity';
import { ApplicationSourceEntity } from './application-source.entity';
import { DuplicateCheckEntity } from './duplicate-check.entity';
import { InterviewRoundEntity } from '../../interview-rounds/entities/interview-round.entity';
import { TestRoundEntity } from '../../test-rounds/entities/test-round.entity';
import { OfferEntity } from '../../offers/entities/offer.entity';
import { UserEntity } from '../../auth/entities/user.entity';

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
@Index('IDX_applications_current_stage', ['currentStage'])
@Index('IDX_applications_hired_at', ['hiredAt'])
@Index('IDX_applications_onboarding_status', ['onboardingStatus'])
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

  // ========================================
  // NEW: Recruitment Pipeline Stage
  // ========================================
  @Column({ name: 'current_stage', type: 'varchar', nullable: true })
  currentStage: ApplicationStage | null;

  @Column({ name: 'assigned_recruiter_id', type: 'uuid', nullable: true })
  assignedRecruiterId: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assigned_recruiter_id' })
  assignedRecruiter: UserEntity | null;

  @Column({ name: 'hired_at', type: 'timestamptz', nullable: true })
  hiredAt: Date | null;

  @Column({ name: 'offer_status', type: 'varchar', nullable: true })
  offerStatus: OfferStatus | null;

  @Column({ name: 'onboarding_status', type: 'varchar', nullable: true })
  onboardingStatus: OnboardingStatus | null;

  @Column({ name: 'onboarding_confirmed_at', type: 'timestamptz', nullable: true })
  onboardingConfirmedAt: Date | null;

  @Column({ name: 'onboarding_confirmed_by_id', type: 'uuid', nullable: true })
  onboardingConfirmedById: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'onboarding_confirmed_by_id' })
  onboardingConfirmedBy: UserEntity | null;

  @Column({ name: 'planned_onboard_at', type: 'timestamptz', nullable: true })
  plannedOnboardAt: Date | null;

  @Column({ name: 'onboarding_rejected_at', type: 'timestamptz', nullable: true })
  onboardingRejectedAt: Date | null;

  @Column({ name: 'onboarding_rejected_reason', type: 'text', nullable: true })
  onboardingRejectedReason: string | null;

  // ========================================
  // Existing fields
  // ========================================
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

  @OneToOne(
    () => ApplicationReferralEntity,
    (applicationReferral) => applicationReferral.application,
  )
  freelancerReferral: ApplicationReferralEntity | null;

  @OneToMany(() => DuplicateCheckEntity, (duplicateCheck) => duplicateCheck.application)
  duplicateChecks: DuplicateCheckEntity[];

  // ========================================
  // Pipeline related entities
  // ========================================
  @OneToMany(() => InterviewRoundEntity, (round) => round.application)
  interviewRounds: InterviewRoundEntity[];

  @OneToMany(() => TestRoundEntity, (round) => round.application)
  testRounds: TestRoundEntity[];

  @OneToMany(() => OfferEntity, (offer) => offer.application)
  offers: OfferEntity[];

  // ========================================
  // Status tracking fields
  // ========================================
  @Column({ name: 'mapping_status', type: 'varchar', nullable: true })
  mappingStatus: MappingStatus | null;

  @Column({ name: 'form_status', type: 'varchar', nullable: true })
  formStatus: FormSessionStatus | null;

  @Column({ name: 'ai_screening_status', type: 'varchar', nullable: true })
  aiScreeningStatus: AiScreeningStatus | null;

  @Column({ name: 'hr_review_status', type: 'varchar', nullable: true })
  hrReviewStatus: HrReviewDecisionType | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
