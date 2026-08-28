import { apiClient } from '@/lib/api-client';
import {
  isRecord,
  unwrapEnvelope,
  unwrapPaginated,
} from '@/lib/api-response-helpers';
import type { ApiEnvelope } from '@/lib/api-response-helpers';
import type {
  InterviewEvaluationFormData,
  InterviewEvaluationReviewerSection,
  InterviewEvaluationReviewerStatus,
  InterviewEvaluationRoundKey,
  InterviewEvaluationRoundStatus,
  InterviewEvaluationTemplate,
} from '@interview-assistant/shared';

export interface RecruitmentPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedRecruitmentResult<T> {
  data: T[];
  pagination?: RecruitmentPagination;
}

export interface RecruitmentRelationSummary {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  displayName?: string | null;
  description?: string | null;
}

export interface RecruitmentReferenceRecord {
  id: string;
  name: string;
  displayName?: string | null;
  description?: string | null;
  isActive?: boolean | null;
  orderIndex?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface JobDescriptionRecord {
  id?: string;
  jobDescriptionId?: string;
  title: string;
  positionId?: string | null;
  position?: RecruitmentRelationSummary | null;
  levelId?: string | null;
  level?: RecruitmentRelationSummary | null;
  summary?: string | null;
  description?: string | null;
  overview?: string | null;
  responsibilities?: string | null;
  requirements?: string | null;
  benefits?: unknown;
  salary?: string | null;
  annualLeaveDays?: string | null;
  department?: string | null;
  applicationDeadline?: string | null;
  sourceSystem?: string | null;
  sourceJobId?: string | null;
  sourceSlug?: string | null;
  sourceUrl?: string | null;
  sourceCreatedAt?: string | null;
  sourceModifiedAt?: string | null;
  sourceContentHash?: string | null;
  lastSyncedAt?: string | null;
  status?: string | null;
  createdById?: string | null;
  createdBy?: RecruitmentRelationSummary | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface JobDescriptionVersionRecord {
  id?: string;
  jobDescriptionId?: string;
  jobDescriptionVersionId?: string;
  versionNo?: number;
  snapshot?: unknown;
  status?: string | null;
  createdById?: string | null;
  createdBy?: RecruitmentRelationSummary | null;
  createdAt?: string | null;
}

export interface JobDescriptionPostingOption {
  jobDescriptionId: string;
  jobDescriptionVersionId?: string;
  title: string;
  status?: string | null;
  versionNo?: number;
  position?: RecruitmentRelationSummary | null;
  level?: RecruitmentRelationSummary | null;
  readyForPosting: boolean;
  readinessLabel?: string;
}

export interface JobDescriptionPayload {
  title: string;
  positionId?: string | null;
  levelId?: string | null;
  summary: string;
  description: string;
  overview?: string | null;
  responsibilities?: string | null;
  requirements: string;
  benefits?: Record<string, unknown> | null;
  salary?: string | null;
  annualLeaveDays?: string | null;
  department?: string | null;
  applicationDeadline?: string | null;
}

export interface ListJobDescriptionsParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

export interface ListReferenceDataParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

export interface JobPostingRecord {
  id?: string;
  jobPostingId?: string;
  jobDescriptionId?: string | null;
  jobDescription?: JobDescriptionRecord | null;
  jobDescriptionVersionId?: string | null;
  jobDescriptionVersion?: (JobDescriptionVersionRecord & {
    jobDescription?: JobDescriptionRecord | null;
  }) | null;
  title: string;
  publicSlug?: string | null;
  status?: string | null;
  openAt?: string | null;
  closeAt?: string | null;
  createdById?: string | null;
  createdBy?: RecruitmentRelationSummary | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface JobPostingPayload {
  jobDescriptionId?: string;
  jobDescriptionVersionId?: string;
  title: string;
  publicSlug: string;
  openAt?: string | null;
  closeAt?: string | null;
}

export interface ListJobPostingsParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  jobDescriptionId?: string;
  jobDescriptionVersionId?: string;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

export interface PublishJobPostingPayload {
  publishChannels: string[];
  publishNote?: string;
  facebookTargetIds?: string[];
}

export type FacebookPublishTargetType = 'GROUP' | 'FANPAGE';
export type FacebookPublishResultStatus = 'SUCCESS' | 'FAILED' | 'SKIPPED';
export type FacebookPublishTargetEligibilityStatus = 'UNKNOWN' | 'CAN_POST' | 'CANNOT_POST';

export interface FacebookPublishTarget {
  targetId?: string | null;
  targetType: FacebookPublishTargetType;
  targetName: string;
  targetUrl?: string | null;
  targetExternalId?: string | null;
  eligibilityStatus: FacebookPublishTargetEligibilityStatus;
  eligibilityReason?: string | null;
  lastVerifiedAt?: string | null;
  todayPublishCount: number;
  dailyPublishLimit: number;
  quotaLabel: string;
  quotaExceeded: boolean;
  selectable: boolean;
  disabledReason?: string | null;
}

export type FacebookPublishAttachmentSource = 'LOCAL_UPLOAD' | 'AI_GENERATED';

export interface FacebookPublishImageAttachment {
  type: 'IMAGE';
  source: FacebookPublishAttachmentSource;
  fileName: string;
  mimeType: string;
  size: number;
  dataUrl: string;
}

export type FacebookPublishAttachment = FacebookPublishImageAttachment;

export type FacebookImageAttachFailureDecision = 'SKIP' | 'POST_TEXT_ONLY';

export interface FacebookImageAttachFailureContext {
  target: FacebookPublishTarget;
  attachment: FacebookPublishImageAttachment;
  message: string;
}

export interface FacebookPublishPlan {
  jobPostingId: string;
  content: string;
  targets: FacebookPublishTarget[];
  attachments?: FacebookPublishAttachment[];
  delay: {
    minMs: number;
    maxMs: number;
  };
}

export interface FacebookPublishResultPayload {
  jobPostingId: string;
  targetId?: string | null;
  targetType: FacebookPublishTargetType;
  targetName: string;
  targetUrl?: string | null;
  content?: string | null;
  status: FacebookPublishResultStatus;
  facebookReviewStatus?: string | null;
  message: string;
  externalPostId?: string | null;
  externalPostUrl?: string | null;
  submittedAt?: string | null;
}

export interface FacebookPublishProgress {
  status: string;
  currentIndex: number;
  total: number;
  delayRemainingSeconds?: number;
  target?: FacebookPublishTarget;
  message: string;
  results: FacebookPublishResultPayload[];
}

export interface JobPostingPublishResponse extends JobPostingRecord {
  channels?: JobPostingChannelStatus[];
  facebookPublishPlan?: FacebookPublishPlan;
}

export interface FacebookGroupPayload {
  targetName: string;
  targetUrl: string;
}

export interface VerifyFacebookGroupPayload {
  eligibilityStatus: FacebookPublishTargetEligibilityStatus;
  eligibilityReason?: string | null;
  verifiedAt?: string | null;
}

export interface JobPostingChannelStatus {
  channel?: string;
  status?: string;
  publishedUrl?: string | null;
  externalPostingId?: string | null;
  manualInstruction?: string | null;
  publishedAt?: string | null;
  updatedAt?: string | null;
}

export interface ApplicationCandidateSummary {
  candidateId?: string | null;
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface ApplicationJobPostingSummary {
  jobPostingId?: string | null;
  title?: string | null;
  jobDescriptionVersionId?: string | null;
}

export interface ApplicationInternalSummary {
  referralId?: string | null;
  internalId?: string | null;
  email?: string | null;
}

export interface ApplicationFreelancerSummary {
  referralId?: string | null;
  freelancerId?: string | null;
  identifier?: string | null;
  name?: string | null;
}

export interface ApplicationListRecord {
  applicationId: string;
  candidate?: ApplicationCandidateSummary | null;
  jobPosting?: ApplicationJobPostingSummary | null;
  freelancer?: ApplicationFreelancerSummary | null;
  internal?: ApplicationInternalSummary | null;
  referralSource?: 'FREELANCER' | 'INTERNAL' | null;
  referralEvaluation?: string | null;
  freelancerEvaluation?: string | null;
  status?: string | null;
  currentStage?: string | null;
  offerStatus?: string | null;
  onboardingStatus?: 'PENDING' | 'COMPLETED' | 'REJECTED' | null;
  onboardingConfirmedAt?: string | null;
  onboardingConfirmedById?: string | null;
  plannedOnboardAt?: string | null;
  onboardingRejectedAt?: string | null;
  onboardingRejectedReason?: string | null;
  hiredAt?: string | null;
  hrReceptionStatus?: string | null;
  sourceChannel?: string | null;
  mappingScore?: number | null;
  aiScreeningScore?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface ApplicationCvSummary {
  currentCvDocumentId?: string | null;
  documentType?: string | null;
  versionNo?: number | null;
  originalFileName?: string | null;
  scanStatus?: string | null;
  sanitizeStatus?: string | null;
  parseStatus?: string | null;
  createdAt?: string | null;
}

export interface ApplicationMappingSummary {
  mappingResultId?: string | null;
  score?: number | null;
  status?: string | null;
  recommendation?: string | null;
  createdAt?: string | null;
}

export interface ApplicationFormSummary {
  formSessionId?: string | null;
  status?: string | null;
  expiresAt?: string | null;
  submittedAt?: string | null;
  createdAt?: string | null;
}

export interface ApplicationAiScreeningInsight {
  title?: string | null;
  evidence?: string | null;
  confidence?: string | null;
  severity?: string | null;
}

export interface ApplicationAiScreeningSummary {
  aiScreeningResultId?: string | null;
  score?: number | null;
  status?: string | null;
  recommendation?: string | null;
  summary?: string | null;
  strengths?: ApplicationAiScreeningInsight[];
  gaps?: ApplicationAiScreeningInsight[];
  risks?: ApplicationAiScreeningInsight[];
  createdAt?: string | null;
}

export interface ApplicationSourceRecord {
  applicationSourceId?: string | null;
  sourceType?: string | null;
  channel?: string | null;
  externalLeadId?: string | null;
  externalApplicationId?: string | null;
  receivedAt?: string | null;
}

export interface ApplicationDetailRecord extends ApplicationListRecord {
  source?: string | null;
  externalApplicationId?: string | null;
  cv?: ApplicationCvSummary | null;
  mapping?: ApplicationMappingSummary | null;
  form?: ApplicationFormSummary | null;
  aiScreening?: ApplicationAiScreeningSummary | null;
  sources?: ApplicationSourceRecord[];
}

export interface InterviewEvaluationReviewerRecord {
  id: string;
  userId: string;
  name: string;
  email?: string | null;
  section: InterviewEvaluationReviewerSection;
  status: InterviewEvaluationReviewerStatus;
  formData?: InterviewEvaluationFormData;
  submittedAt?: string | null;
}

export interface InterviewEvaluationRoundSummary {
  id: string;
  committeeId?: string | null;
  key: string;
  name: string;
  amisRoundId?: string | null;
  amisRoundType?: number | null;
  amisSortOrder?: number | null;
  status: InterviewEvaluationRoundStatus;
  version: number;
  completedAt?: string | null;
  nextRoundKey?: string;
}

export interface InterviewEvaluationSummary {
  hasCase: boolean;
  applicationId: string;
  caseId?: string;
  candidate: { id: string; name?: string | null; email?: string | null; phone?: string | null; birthYear?: number | null };
  job: { id: string; title?: string | null; jobDescriptionVersionId?: string | null };
  template: InterviewEvaluationTemplate | null;
  currentRound: InterviewEvaluationRoundSummary | {
    key: string;
    name: string;
    status: null;
  };
  reviewerProgress: { total: number; submitted: number };
  canManage: boolean;
  canView: boolean;
}

export interface InterviewEvaluationDetail {
  case: {
    id: string;
    applicationId: string;
    candidate: InterviewEvaluationSummary['candidate'];
    job: InterviewEvaluationSummary['job'];
    template: InterviewEvaluationTemplate;
    source?: string | null;
    sourceChannel?: string | null;
    attractivePersonnelName?: string | null;
  };
  currentRound: InterviewEvaluationRoundSummary & {
    hrbpData: InterviewEvaluationFormData;
    committeeData: InterviewEvaluationFormData;
    aggregateData: InterviewEvaluationFormData;
  };
  rounds: InterviewEvaluationRoundSummary[];
  reviewers: InterviewEvaluationReviewerRecord[];
  audits: Array<{
    id: string;
    action: string;
    fromStatus?: string | null;
    toStatus?: string | null;
    metadata?: Record<string, unknown>;
    createdAt?: string;
  }>;
  permissions: {
    canManage: boolean;
    canReview: boolean;
    canAggregate: boolean;
    canComplete: boolean;
  };
}

export interface AssignedInterviewEvaluation {
  applicationId: string;
  caseId: string;
  candidate: InterviewEvaluationSummary['candidate'];
  job: InterviewEvaluationSummary['job'];
  round: InterviewEvaluationRoundSummary;
  reviewer: {
    id: string;
    status: InterviewEvaluationReviewerStatus;
    submittedAt?: string | null;
  };
  reviewerProgress: { total: number; submitted: number };
}

export interface AssignableRecruitmentUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface InterviewCommitteeMember {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface InterviewCommittee {
  id: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  memberCount: number;
  members: InterviewCommitteeMember[];
  createdAt?: string;
  updatedAt?: string;
}

export interface ListApplicationsParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  sourceChannel?: string;
  candidateId?: string;
  jobPostingId?: string;
  jobDescriptionVersionId?: string;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

export interface ApplicationTimelineParams {
  limit?: number;
  offset?: number;
}

export interface ApplicationTimelineRecord {
  id?: string;
  eventType: string;
  fromStatus?: string | null;
  status?: string | null;
  actorType?: string | null;
  actorId?: string | null;
  message?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: string | null;
}

export interface ApplicationAuditLogRecord {
  auditLogId?: string;
  id?: string;
  applicationId?: string | null;
  action: string;
  actorType?: string | null;
  actorId?: string | null;
  objectType?: string | null;
  objectId?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: string | null;
}

export interface ListApplicationAuditLogsParams {
  page?: number;
  limit?: number;
}

export interface CvDocumentMetadataRecord {
  applicationId: string;
  cvDocumentId: string;
  documentType?: string | null;
  versionNo: number;
  fileName?: string | null;
  fileType?: string | null;
  fileSize?: number | null;
  originalFileHash?: string | null;
  cleanFileHash?: string | null;
  storageZone?: string | null;
  storageKeyRecorded?: boolean;
  scanStatus?: string | null;
  sanitizeStatus?: string | null;
  parseStatus?: string | null;
  isCurrent?: boolean;
  cleanFileUrl?: string | null;
  createdAt?: string | null;
}

export interface CvVersionRecord {
  versionNo: number;
  isCurrent: boolean;
  original: CvDocumentMetadataRecord | null;
  clean: CvDocumentMetadataRecord | null;
}

export interface ParsedProfileRecord {
  parsedProfileId?: string;
  id?: string;
  applicationId?: string;
  cvDocumentId?: string;
  candidateId?: string | null;
  parserVersion?: string | null;
  parsedData?: Record<string, unknown> | null;
  profile?: Record<string, unknown> | null;
  rawText?: string | null;
  normalizedText?: string | null;
  normalizedTextHash?: string | null;
  normalizedTextHashRecorded?: boolean;
  parseConfidence?: number | null;
  warnings?: string[] | null;
  status?: string | null;
  createdAt?: string | null;
}

export function listJobDescriptions(params: ListJobDescriptionsParams) {
  const queryParams: Record<string, string | number | boolean | undefined> = {
    page: params.page,
    limit: params.limit,
    search: params.search,
    status: params.status,
    sortBy: params.sortBy,
    sortOrder: params.sortOrder,
  };

  return apiClient
    .get<unknown>('/job-descriptions', queryParams)
    .then((response) => unwrapPaginated<JobDescriptionRecord>(response));
}

export interface VcsPortalJobDescriptionSyncResult {
  fetchedCount: number;
  createdCount: number;
  updatedCount: number;
  unchangedCount: number;
  archivedCount: number;
  failedCount: number;
  questionCount: number;
  warnings?: Array<{ code: string; message: string }>;
}

export function syncVcsPortalJobDescriptions() {
  return apiClient
    .post<ApiEnvelope<VcsPortalJobDescriptionSyncResult>>('/extension/vcs-portal/jds/sync')
    .then(unwrapEnvelope);
}

function listReferenceData(path: string, params: ListReferenceDataParams = {}) {
  const queryParams: Record<string, string | number | boolean | undefined> = {
    page: params.page,
    limit: params.limit,
    search: params.search,
    status: params.status,
    sortBy: params.sortBy,
    sortOrder: params.sortOrder,
  };

  return apiClient
    .get<unknown>(path, queryParams)
    .then((response) => unwrapPaginated<RecruitmentReferenceRecord>(response));
}

export function listPositions(params: ListReferenceDataParams = {}) {
  return listReferenceData('/positions', params);
}

export function listLevels(params: ListReferenceDataParams = {}) {
  return listReferenceData('/levels', params);
}

export function getJobDescription(id: string) {
  return apiClient
    .get<ApiEnvelope<JobDescriptionRecord> | JobDescriptionRecord>(
      `/job-descriptions/${encodeURIComponent(id)}`,
    )
    .then(unwrapEnvelope);
}

export function createJobDescription(payload: JobDescriptionPayload, idempotencyKey: string) {
  return apiClient
    .post<ApiEnvelope<JobDescriptionRecord> | JobDescriptionRecord>(
      '/job-descriptions',
      payload,
      { idempotencyKey },
    )
    .then(unwrapEnvelope);
}

export function updateJobDescription(
  id: string,
  payload: JobDescriptionPayload,
  idempotencyKey: string,
) {
  return apiClient
    .put<ApiEnvelope<JobDescriptionRecord> | JobDescriptionRecord>(
      `/job-descriptions/${encodeURIComponent(id)}`,
      payload,
      { idempotencyKey },
    )
    .then(unwrapEnvelope);
}

export function listJobDescriptionVersions(id: string) {
  return apiClient
    .get<unknown>(`/job-descriptions/${encodeURIComponent(id)}/versions`)
    .then((response) => {
      const data = unwrapEnvelope(response);
      return Array.isArray(data) ? (data as JobDescriptionVersionRecord[]) : [];
    });
}

function getReadinessLabel(
  isArchived: boolean,
  isReady: boolean,
  activeVersionId?: string,
) {
  if (isArchived) return 'Archived JD cannot be used for posting';
  if (!isReady) return 'Draft JD will be marked ready before creating posting';
  if (!activeVersionId) return 'JD will be snapshotted before creating posting';
  return undefined;
}

export async function listReadyJobDescriptionOptions() {
  const jobDescriptions = await listJobDescriptions({
    page: 1,
    limit: 100,
    sortBy: 'updatedAt',
    sortOrder: 'DESC',
  });

  const options: Array<JobDescriptionPostingOption | null> = await Promise.all(
    jobDescriptions.data.map(async (jobDescription) => {
      const jobDescriptionId = jobDescription.id ?? jobDescription.jobDescriptionId;
      if (!jobDescriptionId) {
        return null;
      }

      const versions = await listJobDescriptionVersions(jobDescriptionId).catch(() => []);
      const activeVersion = versions.find((version) => version.status === 'ACTIVE');
      const activeVersionId = activeVersion?.id ?? activeVersion?.jobDescriptionVersionId;
      const isArchived = jobDescription.status === 'ARCHIVED' || jobDescription.status === 'JD_ARCHIVED';
      const isReady = jobDescription.status === 'ACTIVE' || jobDescription.status === 'READY' || jobDescription.status === 'JD_READY';
      const readyForPosting = Boolean(!isArchived && isReady && activeVersionId);
      const readinessLabel = getReadinessLabel(isArchived, isReady, activeVersionId);

      return {
        jobDescriptionId,
        jobDescriptionVersionId: activeVersionId,
        title: jobDescription.title,
        status: jobDescription.status,
        versionNo: activeVersion?.versionNo,
        position: jobDescription.position ?? null,
        level: jobDescription.level ?? null,
        readyForPosting,
        readinessLabel,
      } satisfies JobDescriptionPostingOption;
    }),
  );

  return options.filter((option): option is JobDescriptionPostingOption => option !== null);
}

export function createJobDescriptionVersion(
  id: string,
  changeNote: string,
  idempotencyKey: string,
) {
  return apiClient
    .post<ApiEnvelope<JobDescriptionVersionRecord> | JobDescriptionVersionRecord>(
      `/job-descriptions/${encodeURIComponent(id)}/versions`,
      { changeNote },
      { idempotencyKey },
    )
    .then(unwrapEnvelope);
}

export function markJobDescriptionReady(id: string, idempotencyKey: string) {
  return apiClient
    .post<ApiEnvelope<JobDescriptionRecord> | JobDescriptionRecord>(
      `/job-descriptions/${encodeURIComponent(id)}/mark-ready`,
      undefined,
      { idempotencyKey },
    )
    .then(unwrapEnvelope);
}

export function listJobPostings(params: ListJobPostingsParams) {
  const queryParams: Record<string, string | number | boolean | undefined> = {
    page: params.page,
    limit: params.limit,
    search: params.search,
    status: params.status,
    jobDescriptionId: params.jobDescriptionId,
    jobDescriptionVersionId: params.jobDescriptionVersionId,
    sortBy: params.sortBy,
    sortOrder: params.sortOrder,
  };

  return apiClient
    .get<unknown>('/job-postings', queryParams)
    .then((response) => unwrapPaginated<JobPostingRecord>(response));
}

export function getJobPosting(id: string) {
  return apiClient
    .get<ApiEnvelope<JobPostingRecord> | JobPostingRecord>(
      `/job-postings/${encodeURIComponent(id)}`,
    )
    .then(unwrapEnvelope);
}

export function createJobPosting(payload: JobPostingPayload, idempotencyKey: string) {
  return apiClient
    .post<ApiEnvelope<JobPostingRecord> | JobPostingRecord>(
      '/job-postings',
      payload,
      { idempotencyKey },
    )
    .then(unwrapEnvelope);
}

export function updateJobPosting(
  id: string,
  payload: Omit<JobPostingPayload, 'jobDescriptionVersionId'>,
  idempotencyKey: string,
) {
  return apiClient
    .put<ApiEnvelope<JobPostingRecord> | JobPostingRecord>(
      `/job-postings/${encodeURIComponent(id)}`,
      payload,
      { idempotencyKey },
    )
    .then(unwrapEnvelope);
}

export function publishJobPosting(
  id: string,
  payload: PublishJobPostingPayload,
  idempotencyKey: string,
) {
  return apiClient
    .post<ApiEnvelope<JobPostingPublishResponse> | JobPostingPublishResponse>(
      `/job-postings/${encodeURIComponent(id)}/publish`,
      payload,
      { idempotencyKey },
    )
    .then(unwrapEnvelope);
}

export function reportFacebookPublishResult(payload: FacebookPublishResultPayload) {
  return apiClient
    .post<ApiEnvelope<{ id: string; status: string }> | { id: string; status: string }>(
      '/extension/facebook/publish-results',
      payload,
    )
    .then(unwrapEnvelope);
}

export function listFacebookGroups() {
  return apiClient
    .get<ApiEnvelope<FacebookPublishTarget[]> | FacebookPublishTarget[]>('/extension/facebook/groups')
    .then(unwrapEnvelope);
}

export function createFacebookGroup(payload: FacebookGroupPayload) {
  return apiClient
    .post<ApiEnvelope<FacebookPublishTarget> | FacebookPublishTarget>('/extension/facebook/groups', payload)
    .then(unwrapEnvelope);
}

export function updateFacebookGroup(targetId: string, payload: FacebookGroupPayload) {
  return apiClient
    .put<ApiEnvelope<FacebookPublishTarget> | FacebookPublishTarget>(
      `/extension/facebook/groups/${encodeURIComponent(targetId)}`,
      payload,
    )
    .then(unwrapEnvelope);
}

export function verifyFacebookGroup(targetId: string, payload: VerifyFacebookGroupPayload) {
  return apiClient
    .post<ApiEnvelope<FacebookPublishTarget> | FacebookPublishTarget>(
      `/extension/facebook/groups/${encodeURIComponent(targetId)}/verify-result`,
      payload,
    )
    .then(unwrapEnvelope);
}

export function deleteFacebookGroup(targetId: string) {
  return apiClient
    .delete<ApiEnvelope<FacebookPublishTarget> | FacebookPublishTarget>(
      `/extension/facebook/groups/${encodeURIComponent(targetId)}`,
    )
    .then(unwrapEnvelope);
}

export function closeJobPosting(id: string, idempotencyKey: string) {
  return apiClient
    .post<ApiEnvelope<JobPostingRecord> | JobPostingRecord>(
      `/job-postings/${encodeURIComponent(id)}/close`,
      { closeAt: new Date().toISOString() },
      { idempotencyKey },
    )
    .then(unwrapEnvelope);
}

export function listJobPostingChannels(id: string) {
  return apiClient
    .get<unknown>(`/job-postings/${encodeURIComponent(id)}/channels`)
    .then((response) => {
      const data = unwrapEnvelope(response);
      if (Array.isArray(data)) return data as JobPostingChannelStatus[];
      if (isRecord(data) && Array.isArray(data.channels)) {
        return data.channels as JobPostingChannelStatus[];
      }
      return [];
    });
}

export function listApplications(params: ListApplicationsParams) {
  const queryParams: Record<string, string | number | boolean | undefined> = {
    page: params.page,
    limit: params.limit,
    search: params.search,
    status: params.status,
    sourceChannel: params.sourceChannel,
    candidateId: params.candidateId,
    jobPostingId: params.jobPostingId,
    jobDescriptionVersionId: params.jobDescriptionVersionId,
    sortBy: params.sortBy,
    sortOrder: params.sortOrder,
  };

  return apiClient
    .get<unknown>('/applications', queryParams)
    .then((response) => unwrapPaginated<ApplicationListRecord>(response));
}

export function getApplication(applicationId: string) {
  return apiClient
    .get<ApiEnvelope<ApplicationDetailRecord> | ApplicationDetailRecord>(
      `/applications/${encodeURIComponent(applicationId)}`,
    )
    .then(unwrapEnvelope);
}

export function confirmApplicationOnboarding(applicationId: string, plannedOnboardAt?: string) {
  return apiClient
    .post<ApiEnvelope<ApplicationDetailRecord> | ApplicationDetailRecord>(
      `/applications/${encodeURIComponent(applicationId)}/onboarding/confirm`,
      plannedOnboardAt ? { plannedOnboardAt } : {},
    )
    .then(unwrapEnvelope);
}

export function completeApplicationOnboarding(applicationId: string, onboardedAt?: string) {
  return apiClient
    .post<ApiEnvelope<ApplicationDetailRecord> | ApplicationDetailRecord>(
      `/applications/${encodeURIComponent(applicationId)}/onboarding/complete`,
      onboardedAt ? { onboardedAt } : {},
    )
    .then(unwrapEnvelope);
}

export function rejectApplicationOnboarding(applicationId: string, reason?: string) {
  return apiClient
    .post<ApiEnvelope<ApplicationDetailRecord> | ApplicationDetailRecord>(
      `/applications/${encodeURIComponent(applicationId)}/onboarding/reject`,
      reason ? { reason } : {},
    )
    .then(unwrapEnvelope);
}

export function getInterviewEvaluationSummary(applicationId: string) {
  return apiClient
    .get<InterviewEvaluationSummary>(
      `/applications/${encodeURIComponent(applicationId)}/interview-evaluations/summary`,
    )
    .then(unwrapEnvelope);
}

export function listAssignedInterviewEvaluations() {
  return apiClient
    .get<AssignedInterviewEvaluation[]>('/interview-evaluations/assigned')
    .then(unwrapEnvelope);
}

export function getInterviewEvaluation(applicationId: string, roundId?: string) {
  const query = roundId ? `?roundId=${encodeURIComponent(roundId)}` : '';
  return apiClient
    .get<InterviewEvaluationDetail>(
      `/applications/${encodeURIComponent(applicationId)}/interview-evaluations${query}`,
    )
    .then(unwrapEnvelope);
}

export function listAssignableRecruitmentUsers() {
  return apiClient
    .get<AssignableRecruitmentUser[]>('/auth/users/assignable')
    .then(unwrapEnvelope);
}

export function listInterviewCommittees(activeOnly = false) {
  return apiClient
    .get<InterviewCommittee[]>('/interview-committees', { activeOnly })
    .then(unwrapEnvelope);
}

export function listInterviewCommitteeUsers() {
  return apiClient
    .get<AssignableRecruitmentUser[]>('/interview-committees/available-users')
    .then(unwrapEnvelope);
}

export function createInterviewCommittee(payload: { name: string; description?: string }) {
  return apiClient
    .post<InterviewCommittee>('/interview-committees', payload)
    .then(unwrapEnvelope);
}

export function updateInterviewCommittee(
  committeeId: string,
  payload: { name?: string; description?: string | null; isActive?: boolean },
) {
  return apiClient
    .patch<InterviewCommittee>(`/interview-committees/${encodeURIComponent(committeeId)}`, payload)
    .then(unwrapEnvelope);
}

export function updateInterviewCommitteeMembers(committeeId: string, userIds: string[]) {
  return apiClient
    .put<InterviewCommittee>(
      `/interview-committees/${encodeURIComponent(committeeId)}/members`,
      { userIds },
    )
    .then(unwrapEnvelope);
}

export function createInterviewEvaluationCase(
  applicationId: string,
  payload: {
    roundKey?: InterviewEvaluationRoundKey;
    roundName: string;
    amisRoundId?: string;
    amisRoundType?: number;
    amisSortOrder?: number;
    template?: InterviewEvaluationTemplate;
    committeeId?: string;
    committeeUserIds?: string[];
  },
) {
  return apiClient
    .post<InterviewEvaluationDetail>(
      `/applications/${encodeURIComponent(applicationId)}/interview-evaluations/rounds`,
      payload,
    )
    .then(unwrapEnvelope);
}

export function saveInterviewEvaluationReview(
  applicationId: string,
  roundId: string,
  section: InterviewEvaluationReviewerSection,
  payload: { formData: InterviewEvaluationFormData; expectedVersion?: number },
  options?: { keepalive?: boolean },
) {
  return apiClient
    .patch<InterviewEvaluationDetail>(
      `/applications/${encodeURIComponent(applicationId)}/interview-evaluations/rounds/${encodeURIComponent(roundId)}/reviews/${encodeURIComponent(section)}`,
      payload,
      options,
    )
    .then(unwrapEnvelope);
}

export function submitInterviewEvaluationReview(
  applicationId: string,
  roundId: string,
  section: InterviewEvaluationReviewerSection,
  payload: { formData: InterviewEvaluationFormData; expectedVersion?: number },
) {
  return apiClient
    .post<InterviewEvaluationDetail>(
      `/applications/${encodeURIComponent(applicationId)}/interview-evaluations/rounds/${encodeURIComponent(roundId)}/reviews/${encodeURIComponent(section)}/submit`,
      payload,
    )
    .then(unwrapEnvelope);
}

export function aggregateInterviewEvaluation(
  applicationId: string,
  roundId: string,
  payload: { formData: InterviewEvaluationFormData; expectedVersion?: number },
) {
  return apiClient
    .patch<InterviewEvaluationDetail>(
      `/applications/${encodeURIComponent(applicationId)}/interview-evaluations/rounds/${encodeURIComponent(roundId)}/aggregate`,
      payload,
    )
      .then(unwrapEnvelope);
}

export function saveInterviewEvaluationAggregateDraft(
  applicationId: string,
  roundId: string,
  payload: { formData: InterviewEvaluationFormData; expectedVersion?: number },
  options?: { keepalive?: boolean },
) {
  return apiClient
    .patch<InterviewEvaluationDetail>(
      `/applications/${encodeURIComponent(applicationId)}/interview-evaluations/rounds/${encodeURIComponent(roundId)}/aggregate/draft`,
      payload,
      options,
    )
    .then(unwrapEnvelope);
}

export function completeInterviewEvaluation(applicationId: string, roundId: string) {
  return apiClient
    .post<InterviewEvaluationDetail>(
      `/applications/${encodeURIComponent(applicationId)}/interview-evaluations/rounds/${encodeURIComponent(roundId)}/complete`,
    )
    .then(unwrapEnvelope);
}

export function createNextInterviewEvaluationRound(applicationId: string, roundId: string) {
  return apiClient
    .post<InterviewEvaluationDetail>(
      `/applications/${encodeURIComponent(applicationId)}/interview-evaluations/rounds/${encodeURIComponent(roundId)}/next`,
    )
    .then(unwrapEnvelope);
}

export function runApplicationAiScreening(applicationId: string) {
  return apiClient
    .post<ApiEnvelope<ApplicationDetailRecord> | ApplicationDetailRecord>(
      `/applications/${encodeURIComponent(applicationId)}/ai-screening/run`,
    )
    .then(unwrapEnvelope);
}

export function listApplicationTimeline(
  applicationId: string,
  params: ApplicationTimelineParams = {},
) {
  return apiClient
    .get<unknown>(
      `/applications/${encodeURIComponent(applicationId)}/timeline`,
      {
        limit: params.limit,
        offset: params.offset,
      },
    )
    .then((response) => {
      const data = unwrapEnvelope(response);
      return Array.isArray(data) ? (data as ApplicationTimelineRecord[]) : [];
    });
}

export function listApplicationAuditLogs(
  applicationId: string,
  params: ListApplicationAuditLogsParams = {},
) {
  return apiClient
    .get<unknown>(
      `/applications/${encodeURIComponent(applicationId)}/audit-logs`,
      {
        page: params.page,
        limit: params.limit,
      },
    )
    .then((response) => unwrapPaginated<ApplicationAuditLogRecord>(response));
}

export function listCvVersions(applicationId: string) {
  return apiClient
    .get<unknown>(`/applications/${encodeURIComponent(applicationId)}/cv`)
    .then((response) => {
      const data = unwrapEnvelope(response);
      if (isRecord(data) && Array.isArray(data.versions)) {
        return data.versions as CvVersionRecord[];
      }
      if (Array.isArray(data)) return data as CvVersionRecord[];
      return [];
    });
}

export function getParsedProfile(applicationId: string) {
  return apiClient
    .get<ApiEnvelope<ParsedProfileRecord> | ParsedProfileRecord>(
      `/applications/${encodeURIComponent(applicationId)}/parsed-profile`,
    )
    .then(unwrapEnvelope);
}

export function parseApplicationCv(applicationId: string, cvDocumentId: string) {
  return apiClient
    .post<ApiEnvelope<ParsedProfileRecord> | ParsedProfileRecord>(
      `/applications/${encodeURIComponent(applicationId)}/cv/${encodeURIComponent(cvDocumentId)}/parse`,
      { parserMode: 'GEMINI', force: true },
    )
    .then(unwrapEnvelope);
}

export function downloadCleanCv(
  applicationId: string,
  cvDocumentId: string,
  disposition: 'inline' | 'attachment',
) {
  return apiClient.downloadBlob(
    `/applications/${encodeURIComponent(applicationId)}/cv/${encodeURIComponent(cvDocumentId)}/clean-file?disposition=${disposition}`,
  );
}
