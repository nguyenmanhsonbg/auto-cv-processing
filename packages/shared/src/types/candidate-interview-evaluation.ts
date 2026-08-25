export enum InterviewEvaluationTemplate {
  KNL = 'BM04.1_KNL',
  CAREERPATH = 'BM04.2_CAREERPATH',
}

export enum InterviewEvaluationRoundKey {
  ECC = 'ECC',
  ACC = 'ACC',
  OFFER = 'OFFER',
}

export enum InterviewEvaluationRoundStatus {
  READY_TO_EVALUATE = 'READY_TO_EVALUATE',
  DRAFT = 'DRAFT',
  WAITING_COMMITTEE = 'WAITING_COMMITTEE',
  IN_REVIEW = 'IN_REVIEW',
  WAITING_AGGREGATION = 'WAITING_AGGREGATION',
  NEEDS_REVISION = 'NEEDS_REVISION',
  COMPLETED = 'COMPLETED',
  LOCKED = 'LOCKED',
}

export enum InterviewEvaluationReviewerSection {
  HRBP = 'HRBP',
  COMMITTEE = 'COMMITTEE',
}

export enum InterviewEvaluationReviewerStatus {
  PENDING = 'PENDING',
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
}

export enum InterviewEvaluationAuditAction {
  CASE_CREATED = 'CASE_CREATED',
  ROUND_CREATED = 'ROUND_CREATED',
  REVIEW_SAVED = 'REVIEW_SAVED',
  REVIEW_SUBMITTED = 'REVIEW_SUBMITTED',
  AGGREGATION_SAVED = 'AGGREGATION_SAVED',
  ROUND_COMPLETED = 'ROUND_COMPLETED',
  NEXT_ROUND_CREATED = 'NEXT_ROUND_CREATED',
  ROUND_CONTEXT_SYNCHRONIZED = 'ROUND_CONTEXT_SYNCHRONIZED',
}

export type InterviewEvaluationResult = 'PASS' | 'FAIL' | 'PENDING';

export interface InterviewEvaluationFormData {
  overall?: {
    result?: InterviewEvaluationResult;
    strengths?: string;
    concerns?: string;
    notes?: string;
  };
  hrbp?: {
    educationCertificates?: string;
    foreignLanguage?: string;
    experienceSummary?: string;
    projectsHighlights?: string;
    developmentMotivation?: string;
    onboardingTimeline?: string;
    concerns?: string;
    /** Legacy fields retained so existing evaluation records remain readable. */
    level?: string;
    placement?: string;
    salaryExpectation?: string;
    noticePeriod?: string;
    motivation?: string;
    notes?: string;
  };
  committee?: {
    technicalRating?: number;
    problemSolvingRating?: number;
    communicationRating?: number;
    teamworkRating?: number;
    leadershipRating?: number;
    notes?: string;
  };
  final?: {
    result?: InterviewEvaluationResult;
    proposedLevel?: string;
    proposedSalary?: string;
    nextAction?: string;
    notes?: string;
  };
}
