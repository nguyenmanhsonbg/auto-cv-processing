import { BadRequestException } from '@nestjs/common';
import {
  ApplicationStatus,
  HrReviewDecisionType,
} from '../recruitment-common';

export const FREELANCER_PHONE_MAX_LENGTH = 50;

export type ReferralApplicationStatusCategory = 'PROCESSING' | 'PASSED' | 'REJECTED';

export interface ReferralCurrentAmisStage {
  recruitmentRoundId: string;
  recruitmentRoundName: string | null;
  amisStatus: number | null;
  reasonRemoved: string | null;
  updatedAt: Date | null;
}

export interface ReferralApplicationMetricInput {
  processStatus: ApplicationStatus | string | null;
  hrReceptionStatus: HrReviewDecisionType | string | null;
  currentAmisStage?: ReferralCurrentAmisStage | null;
}

export interface ReferralApplicationRowInput extends ReferralApplicationMetricInput {
  referralId: string;
  applicationId: string;
  candidate: {
    candidateId: string;
    fullName: string;
    assignees?: Array<{ userId: string; name: string; email: string }>;
  };
  jobPosting: {
    jobPostingId: string;
    title: string;
  };
  evaluation: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReferralApplicationRow {
  referralId: string;
  applicationId: string;
  candidate: {
    candidateId: string;
    fullName: string;
  };
  jobPosting: {
    jobPostingId: string;
    title: string;
  };
  processStatus: ApplicationStatus | string | null;
  hrReceptionStatus: HrReviewDecisionType | string | null;
  evaluation: string | null;
  appliedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  assignees: Array<{ userId: string; name: string; email: string }>;
  currentAmisStage: ReferralCurrentAmisStage | null;
  statusCategory: ReferralApplicationStatusCategory;
}

export interface ReferralSourceMetrics {
  total: number;
  processing: number;
  passed: number;
  passRate: number;
}

const REJECTED_PROCESS_STATUSES = new Set<string>([
  ApplicationStatus.APPLICATION_REJECTED_INVALID,
  ApplicationStatus.APPLICATION_REJECTED_RATE_LIMIT,
  ApplicationStatus.CV_REJECTED_MALWARE,
  ApplicationStatus.MAPPING_REJECTED,
  ApplicationStatus.HR_REJECTED,
]);

export function normalizeFreelancerPhone(value?: string | null): string | null {
  const normalized = value?.trim() ?? '';
  if (!normalized) return null;
  if (normalized.length > FREELANCER_PHONE_MAX_LENGTH) {
    throw new BadRequestException({
      code: 'FREELANCER_PHONE_TOO_LONG',
      message: `Freelancer phone must be ${FREELANCER_PHONE_MAX_LENGTH} characters or fewer.`,
    });
  }
  return normalized;
}

export function buildReferralSourceMetrics(
  applications: ReferralApplicationMetricInput[],
): ReferralSourceMetrics {
  const total = applications.length;
  const passed = applications.filter((application) => getReferralApplicationStatusCategory(application) === 'PASSED').length;
  const rejected = applications.filter((application) => getReferralApplicationStatusCategory(application) === 'REJECTED').length;
  const processing = total - passed - rejected;

  return {
    total,
    processing,
    passed,
    passRate: total ? Math.round((passed / total) * 100) : 0,
  };
}

export function mapReferralApplicationRow(
  input: ReferralApplicationRowInput,
): ReferralApplicationRow {
  return {
    referralId: input.referralId,
    applicationId: input.applicationId,
    candidate: {
      candidateId: input.candidate.candidateId,
      fullName: input.candidate.fullName,
    },
    jobPosting: {
      jobPostingId: input.jobPosting.jobPostingId,
      title: input.jobPosting.title,
    },
    processStatus: input.processStatus,
    hrReceptionStatus: input.hrReceptionStatus,
    evaluation: input.evaluation,
    appliedAt: input.createdAt,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    assignees: input.candidate.assignees ?? [],
    currentAmisStage: input.currentAmisStage ?? null,
    statusCategory: getReferralApplicationStatusCategory(input),
  };
}

export function getReferralApplicationStatusCategory(
  application: ReferralApplicationMetricInput,
): ReferralApplicationStatusCategory {
  if (application.currentAmisStage) {
    if (application.currentAmisStage.amisStatus === 0 || application.currentAmisStage.reasonRemoved?.trim()) {
      return 'REJECTED';
    }

    if (normalizeRoundName(application.currentAmisStage.recruitmentRoundName).includes('DA TUYEN')) {
      return 'PASSED';
    }

    return 'PROCESSING';
  }

  if (application.hrReceptionStatus === HrReviewDecisionType.APPROVE
    || application.hrReceptionStatus === HrReviewDecisionType.TALENT_POOL
    || application.processStatus === ApplicationStatus.HR_APPROVED
    || application.processStatus === ApplicationStatus.TALENT_POOL) {
    return 'PASSED';
  }

  if (application.hrReceptionStatus === HrReviewDecisionType.REJECT
    || REJECTED_PROCESS_STATUSES.has(application.processStatus ?? '')
  ) {
    return 'REJECTED';
  }

  return 'PROCESSING';
}

function normalizeRoundName(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/Đ/g, 'D')
    .replace(/đ/g, 'd')
    .toUpperCase()
    .trim();
}
