import { apiClient } from '@/lib/api-client';

interface ApiEnvelope<T> {
  success?: boolean;
  data: T;
  pagination?: RecruitmentPagination;
  meta?: Record<string, unknown>;
}

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

export interface FacebookPublishPlan {
  jobPostingId: string;
  content: string;
  targets: FacebookPublishTarget[];
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
  message: string;
  externalPostId?: string | null;
  submittedAt?: string | null;
}

export interface FacebookPublishProgress {
  status: string;
  currentIndex: number;
  total: number;
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

export interface ApplicationListRecord {
  applicationId: string;
  candidate?: ApplicationCandidateSummary | null;
  jobPosting?: ApplicationJobPostingSummary | null;
  status?: string | null;
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

export interface ApplicationAiScreeningSummary {
  aiScreeningResultId?: string | null;
  score?: number | null;
  status?: string | null;
  recommendation?: string | null;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isApiEnvelope<T>(response: T | ApiEnvelope<T>): response is ApiEnvelope<T> {
  return isRecord(response) && 'data' in response;
}

function unwrapEnvelope<T>(response: T | ApiEnvelope<T>): T {
  if (isApiEnvelope(response)) {
    return response.data;
  }

  return response as T;
}

function readPagination(response: unknown): RecruitmentPagination | undefined {
  if (!isRecord(response)) return undefined;

  const pagination = response.pagination;
  if (isRecord(pagination)) {
    return {
      page: Number(pagination.page ?? 1),
      limit: Number(pagination.limit ?? 20),
      total: Number(pagination.total ?? 0),
      totalPages: Number(pagination.totalPages ?? 1),
    };
  }

  if ('total' in response || 'totalPages' in response) {
    return {
      page: Number(response.page ?? 1),
      limit: Number(response.limit ?? 20),
      total: Number(response.total ?? 0),
      totalPages: Number(response.totalPages ?? 1),
    };
  }

  return undefined;
}

function unwrapPaginated<T>(response: unknown): PaginatedRecruitmentResult<T> {
  if (Array.isArray(response)) {
    return { data: response as T[] };
  }

  if (!isRecord(response)) {
    return { data: [] };
  }

  const pagination = readPagination(response);
  const data = response.data;

  if (Array.isArray(data)) {
    return { data: data as T[], pagination };
  }

  if (isRecord(data) && Array.isArray(data.data)) {
    return {
      data: data.data as T[],
      pagination: readPagination(data) ?? pagination,
    };
  }

  return { data: [], pagination };
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
      const readinessLabel = isArchived
        ? 'Archived JD cannot be used for posting'
        : !isReady
          ? 'Draft JD will be marked ready before creating posting'
          : !activeVersionId
            ? 'JD will be snapshotted before creating posting'
            : undefined;

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

export function downloadCleanCv(
  applicationId: string,
  cvDocumentId: string,
  disposition: 'inline' | 'attachment',
) {
  return apiClient.downloadBlob(
    `/applications/${encodeURIComponent(applicationId)}/cv/${encodeURIComponent(cvDocumentId)}/clean-file?disposition=${disposition}`,
  );
}
