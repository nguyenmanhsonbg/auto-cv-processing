import { BadRequestException } from '@nestjs/common';
import {
  ApplicationStatus,
  HrReviewDecisionType,
} from '../recruitment-common';

export const FREELANCER_PHONE_MAX_LENGTH = 64;

export type ReferralApplicationStatusCategory = 'PROCESSING' | 'PASSED' | 'REJECTED';

export interface ReferralCurrentAmisStage {
  recruitmentRoundId: string;
  recruitmentRoundName: string | null;
  attractivePersonnelName: string | null;
  amisStatus: number | null;
  reasonRemoved: string | null;
  updatedAt: Date | null;
}

export interface ReferralAmisSourceRecord {
  applicationId: string;
  rawPayload: Record<string, unknown> | null;
  receivedAt: Date;
}

export interface ReferralApplicationSourceSnapshot {
  rawPayload: Record<string, unknown> | null;
  receivedAt: Date;
}

export interface ReferralApplicationMetricInput {
  processStatus: ApplicationStatus | string | null;
  hrReceptionStatus: HrReviewDecisionType | string | null;
  currentAmisStage?: ReferralCurrentAmisStage | null;
  hiredAt?: Date | null;
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
  appliedAt?: Date | null;
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

export function buildCurrentAmisStageMap(
  sources: ReferralAmisSourceRecord[],
): Map<string, ReferralCurrentAmisStage> {
  const currentStages = new Map<string, ReferralCurrentAmisStage>();

  for (const source of sources) {
    const rawPayload = source.rawPayload;
    if (!rawPayload || rawPayload.sourceSystem !== 'AMIS') continue;

    const recruitmentRoundId = optionalText(rawPayload.recruitmentRoundId);
    if (!recruitmentRoundId) continue;

    const stageUpdatedAt = parseOptionalDate(rawPayload.stageUpdatedAt)
      ?? parseOptionalDate(rawPayload.lastSyncedAt)
      ?? source.receivedAt;
    const previous = currentStages.get(source.applicationId);
    if (previous && getDateTime(previous.updatedAt) >= getDateTime(stageUpdatedAt)) continue;

    currentStages.set(source.applicationId, {
      recruitmentRoundId,
      recruitmentRoundName: optionalText(rawPayload.recruitmentRoundName),
      attractivePersonnelName: optionalText(
        rawPayload.attractivePersonnelName
        ?? rawPayload.AttractivePersonnel
        ?? rawPayload.AttractivePersonnelName,
      ),
      amisStatus: toNullableNumber(rawPayload.status),
      reasonRemoved: optionalText(
        rawPayload.reasonRemoved
        ?? rawPayload.ReasonRemoved
        ?? rawPayload.reasonRemovedName
        ?? rawPayload.ReasonRemovedName,
      ),
      updatedAt: stageUpdatedAt,
    });
  }

  return currentStages;
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
    appliedAt: input.appliedAt ?? input.createdAt,
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
  // Check AMIS stage first
  if (application.currentAmisStage) {
    if (application.currentAmisStage.amisStatus === 0 || application.currentAmisStage.reasonRemoved?.trim()) {
      return 'REJECTED';
    }

    if (normalizeRoundName(application.currentAmisStage.recruitmentRoundName).includes('DA TUYEN')) {
      return 'PASSED';
    }

    return 'PROCESSING';
  }

  // Check internal hiredAt (this replaces the old HR_APPROVED check)
  if (application.hiredAt) {
    return 'PASSED';
  }

  // Check hrReceptionStatus
  if (application.hrReceptionStatus === HrReviewDecisionType.APPROVE
    || application.hrReceptionStatus === HrReviewDecisionType.TALENT_POOL) {
    return 'PASSED';
  }

  // Check processStatus for rejection
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
    .replaceAll('Đ', 'D')
    .replaceAll('đ', 'd')
    .toUpperCase()
    .trim();
}

function optionalText(value: unknown) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
}

function parseOptionalDate(value: unknown) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== 'string' || !value.trim()) return null;
  const text = value.trim();
  const localDateParts = text.match(
    /^(\d{1,4})[\/-](\d{1,2})[\/-](\d{1,4})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/,
  );
  if (localDateParts) {
    const [, first, second, third, hour = '0', minute = '0', secondOfMinute = '0', fraction = '0'] = localDateParts;
    const isYearFirst = first.length === 4;
    const year = Number(isYearFirst ? first : third);
    const month = Number(second);
    const day = Number(isYearFirst ? third : first);
    const milliseconds = Number(fraction.padEnd(3, '0'));
    return createVietnamLocalDate(
      year,
      month,
      day,
      Number(hour),
      Number(minute),
      Number(secondOfMinute),
      milliseconds,
    );
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function resolveReferralAppliedAt(
  applicationCreatedAt: Date,
  sources?: readonly ReferralApplicationSourceSnapshot[] | null,
) {
  const amisSources = [...(sources ?? [])]
    .filter((source) => source.rawPayload?.sourceSystem === 'AMIS')
    .sort((left, right) => right.receivedAt.getTime() - left.receivedAt.getTime());

  for (const source of amisSources) {
    const rawPayload = source.rawPayload;
    const applyDate = parseOptionalDate(
      rawPayload?.applyDate
        ?? rawPayload?.ApplyDate
        ?? rawPayload?.applicationDate
        ?? rawPayload?.ApplicationDate,
    );
    if (applyDate) return applyDate;
  }

  return applicationCreatedAt;
}

function createVietnamLocalDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  milliseconds: number,
) {
  if (
    year < 1000
    || month < 1 || month > 12
    || day < 1 || day > 31
    || hour < 0 || hour > 23
    || minute < 0 || minute > 59
    || second < 0 || second > 59
    || milliseconds < 0 || milliseconds > 999
  ) return null;

  const utcDate = Date.UTC(year, month - 1, day, hour, minute, second, milliseconds);
  const localDate = new Date(utcDate);
  if (
    localDate.getUTCFullYear() !== year
    || localDate.getUTCMonth() !== month - 1
    || localDate.getUTCDate() !== day
    || localDate.getUTCHours() !== hour
    || localDate.getUTCMinutes() !== minute
    || localDate.getUTCSeconds() !== second
    || localDate.getUTCMilliseconds() !== milliseconds
  ) return null;

  return new Date(utcDate - (7 * 60 * 60 * 1000));
}

function getDateTime(value: Date | null) {
  return value?.getTime() ?? 0;
}

function toNullableNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
