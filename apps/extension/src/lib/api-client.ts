import axios from 'axios';
import { BE_API_BASE_URL, EXTENSION_CAPABILITIES, EXTENSION_VERSION } from '@/lib/config';
import { clearAccessToken, getRefreshToken, setAuthTokens } from '@/features/auth/auth-store';
import {
  clearExtensionInstanceId,
  getExtensionDisplayName,
  getExtensionInstanceId,
  getExtensionInstanceMetadata,
  getOrCreateInstallId,
  setExtensionInstanceId,
} from '@/stores/extension-instance-store';
import type {
  ApiEnvelope,
  ApiPagination,
  ApplicationDetailRecord,
  ParsedProfileRecord,
  AmisApplicationsForRecruitment,
  AmisCandidateStageChangedPayload,
  AmisCareerCatalogItem,
  AmisCareerQuestionContext,
  AmisJobSnapshot,
  CreateAmisCareerQuestionRequest,
  CreateFacebookGroupRequest,
  ManualIncludeFacebookGroupRequest,
  DiscoverFacebookGroupsRequest,
  DiscoverFacebookGroupsResponse,
  ExtensionInstance,
  ExtensionQuestion,
  ExtensionPreviewPublishPlanResponse,
  ExtensionSyncResponse,
  ExtensionTask,
  ExtensionUser,
  FreelancerSelfApplication,
  FreelancerSelfSummary,
  FacebookPublishHistoriesResponse,
  FacebookPublishHistoryStatusCheckRequest,
  FacebookPublishHistoryListItem,
  FacebookReviewStatus,
  FacebookPublishTarget,
  FacebookAccount,
  FacebookGroupSyncState,
  FacebookPublishReservationPayload,
  FacebookPublishResultPayload,
  JobDescriptionQuestionSetContext,
  JobDescriptionSummary,
  JobPostingSummary,
  ChannelPrepareResult,
  SyncAmisApplicationsRequest,
  SyncAmisApplicationsResponse,
  SyncAmisCareersRequest,
  SyncAmisCareersResponse,
  SyncAmisJobPostingRequest,
  SyncVcsPortalJdsResponse,
  RunApplicationAiScreeningResponse,
  UpdateFacebookGroupRequest,
  VerifyFacebookGroupRequest,
  CreatedFreelancerResult,
  ReferralManagementPage,
  ReferralManagementPerson,
  ReferralManagementSource,
} from '@/types/types';

export class ApiClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details: unknown[] = [],
  ) {
    super(message);
  }
}

const SHOULD_BYPASS_NGROK_WARNING = getApiHost().includes('ngrok');

export async function login(loginIdentifier: string, password: string) {
  return request<{ accessToken: string; refreshToken: string; user: ExtensionUser }>('/auth/login', {
    method: 'POST',
    body: { login: loginIdentifier, password },
  });
}

export async function requestInternalPassword(email: string) {
  return request<{ message: string }>('/auth/internal/request-password', {
    method: 'POST',
    body: { email },
    skipExtensionInstanceHeader: true,
  });
}

export async function requestPasswordReset(login: string) {
  return request<{ challengeId: string; email: string; message: string }>('/auth/password-reset/request', {
    method: 'POST',
    body: { login },
    skipExtensionInstanceHeader: true,
  });
}

export async function checkPasswordResetLogin(login: string) {
  return request<{ exists: boolean; hint?: 'INVALID_LOGIN' | 'INTERNAL_PASSWORD_REQUIRED' | 'HR_NOT_ALLOWED' }>('/auth/password-reset/check-login', {
    method: 'POST',
    body: { login },
    skipExtensionInstanceHeader: true,
  });
}

export async function verifyPasswordReset(challengeId: string, otp: string) {
  return request<{ resetToken: string; message: string }>('/auth/password-reset/verify', {
    method: 'POST',
    body: { challengeId, otp },
    skipExtensionInstanceHeader: true,
  });
}

export async function completePasswordReset(resetToken: string, input: { newPassword: string; confirmPassword: string }) {
  return request<{ message: string }>('/auth/password-reset/complete', {
    method: 'POST',
    body: { resetToken, ...input },
    skipExtensionInstanceHeader: true,
  });
}

export async function getCurrentUser(accessToken: string) {
  return request<ExtensionUser>('/auth/me', {
    method: 'GET',
    accessToken,
  });
}

export async function changePassword(
  accessToken: string,
  input: { currentPassword: string; newPassword: string; confirmPassword: string },
) {
  return request<{ message: string }>('/auth/password', {
    method: 'PATCH',
    accessToken,
    body: input,
  });
}

export async function getFreelancerSummary(accessToken: string) {
  return request<FreelancerSelfSummary>('/freelancers/me/summary', {
    method: 'GET',
    accessToken,
  });
}

export async function listFreelancerApplications(
  accessToken: string,
  params: { page?: number; limit?: number; search?: string; processStatus?: string; hrReceptionStatus?: string; sortOrder?: 'ASC' | 'DESC' } = {},
) {
  const searchParams = new URLSearchParams();
  searchParams.set('page', String(params.page ?? 1));
  searchParams.set('limit', String(params.limit ?? 20));
  if (params.search?.trim()) searchParams.set('search', params.search.trim());
  if (params.processStatus) searchParams.set('processStatus', params.processStatus);
  if (params.hrReceptionStatus) searchParams.set('hrReceptionStatus', params.hrReceptionStatus);
  if (params.sortOrder) searchParams.set('sortOrder', params.sortOrder);

  return requestWithPagination<FreelancerSelfApplication>(
    `/freelancers/me/applications?${searchParams.toString()}`,
    { method: 'GET', accessToken },
  );
}

export async function updateFreelancerApplicationEvaluation(
  accessToken: string,
  referralId: string,
  evaluation: string | null,
) {
  return request<FreelancerSelfApplication>(
    `/freelancers/me/applications/${encodeURIComponent(referralId)}/evaluation`,
    {
      method: 'PATCH',
      accessToken,
      body: { evaluation },
    },
  );
}

export async function getFreelancerApplicationCv(
  accessToken: string,
  referralId: string,
  disposition: 'inline' | 'attachment' = 'inline',
) {
  const path = `/freelancers/me/applications/${encodeURIComponent(referralId)}/cv?disposition=${disposition}`;
  let headers = await buildHeaders(accessToken, { 'X-Extension-Version': EXTENSION_VERSION });

  let response;
  try {
    response = await axiosClient.request<Blob>({
      url: path,
      method: 'GET',
      headers,
      responseType: 'blob',
      validateStatus: () => true,
    });
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    throw new ApiClientError('NETWORK_ERROR', (error as Error)?.message ?? 'Network error.', 0);
  }

  if (response.status === 401) {
    const refreshedAccessToken = await refreshAccessToken();
    if (refreshedAccessToken) {
      headers = await buildHeaders(refreshedAccessToken, { 'X-Extension-Version': EXTENSION_VERSION });
      try {
        response = await axiosClient.request<Blob>({
          url: path,
          method: 'GET',
          headers,
          responseType: 'blob',
          validateStatus: () => true,
        });
      } catch (error) {
        if (error instanceof ApiClientError) throw error;
        throw new ApiClientError('NETWORK_ERROR', (error as Error)?.message ?? 'Network error.', 0);
      }
    }
  }

  if (response.status < 200 || response.status >= 300) {
    let json: unknown = null;
    if (response.data instanceof Blob) {
      try {
        const text = await response.data.text();
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }
    const envelope = isApiEnvelope(json) ? json : null;
    throw new ApiClientError(
      envelope?.error?.code ?? `HTTP_${response.status}`,
      envelope?.error?.message ?? 'Could not load freelancer CV.',
      response.status,
      envelope?.error?.details ?? [],
    );
  }

  const contentDispositionHeader = getHeader(response.headers, 'content-disposition');
  const contentTypeHeader = getHeader(response.headers, 'content-type');

  return {
    blob: response.data,
    fileName: readContentDispositionFileName(contentDispositionHeader) ?? 'cv.pdf',
    mimeType: contentTypeHeader ?? 'application/pdf',
  };
}

export async function ensureRegisteredExtensionInstance(accessToken: string) {
  const installId = await getOrCreateInstallId();
  const instance = await request<ExtensionInstance>('/extension/instances/register', {
    method: 'POST',
    accessToken,
    body: {
      installId,
      displayName: getExtensionDisplayName(),
      version: EXTENSION_VERSION,
      capabilities: EXTENSION_CAPABILITIES,
      metadata: getExtensionInstanceMetadata(),
    },
    skipExtensionInstanceHeader: true,
  });

  await setExtensionInstanceId(instance.id);
  return instance;
}

export async function heartbeatExtensionInstance(accessToken: string) {
  const instanceId = await getExtensionInstanceId();
  if (!instanceId) {
    return ensureRegisteredExtensionInstance(accessToken);
  }

  try {
    return await request<ExtensionInstance>('/extension/instances/heartbeat', {
      method: 'POST',
      accessToken,
      body: {
        displayName: getExtensionDisplayName(),
        version: EXTENSION_VERSION,
        capabilities: EXTENSION_CAPABILITIES,
        metadata: getExtensionInstanceMetadata(),
      },
    });
  } catch (error) {
    if (error instanceof ApiClientError && error.code === 'EXTENSION_INSTANCE_NOT_FOUND') {
      await clearExtensionInstanceId();
      return ensureRegisteredExtensionInstance(accessToken);
    }
    throw error;
  }
}

export async function claimNextExtensionTask(accessToken: string) {
  return request<ExtensionTask | null>('/extension/tasks/next', {
    method: 'GET',
    accessToken,
  });
}

export async function startExtensionTask(accessToken: string, taskId: string) {
  return request<ExtensionTask>(`/extension/tasks/${encodeURIComponent(taskId)}/start`, {
    method: 'POST',
    accessToken,
  });
}

export async function reportExtensionTaskProgress(
  accessToken: string,
  taskId: string,
  payload: { eventType: string; message?: string; payload?: Record<string, unknown> },
) {
  return request<ExtensionTask>(`/extension/tasks/${encodeURIComponent(taskId)}/progress`, {
    method: 'POST',
    accessToken,
    body: payload,
  });
}

export async function completeExtensionTask(
  accessToken: string,
  taskId: string,
  result?: Record<string, unknown>,
) {
  return request<ExtensionTask>(`/extension/tasks/${encodeURIComponent(taskId)}/complete`, {
    method: 'POST',
    accessToken,
    body: result ? { result } : {},
  });
}

export async function failExtensionTask(
  accessToken: string,
  taskId: string,
  payload: { errorCode: string; errorMessage: string; result?: Record<string, unknown> },
) {
  return request<ExtensionTask>(`/extension/tasks/${encodeURIComponent(taskId)}/fail`, {
    method: 'POST',
    accessToken,
    body: payload,
  });
}

export async function listJobDescriptions(
  accessToken: string,
  params: {
    page?: number;
    limit?: number;
    search?: string;
    sourceSystem?: string;
    status?: string;
    latestSyncedOnly?: boolean;
    sortBy?: string;
    sortOrder?: 'ASC' | 'DESC';
  } = {},
) {
  const searchParams = new URLSearchParams();
  searchParams.set('page', String(params.page ?? 1));
  searchParams.set('limit', String(params.limit ?? 20));
  if (params.sourceSystem?.trim()) {
    searchParams.set('sourceSystem', params.sourceSystem.trim());
  }
  if (params.status !== 'ALL') {
    searchParams.set('status', params.status ?? 'ACTIVE');
  }
  searchParams.set('latestSyncedOnly', String(params.latestSyncedOnly ?? false));
  searchParams.set('sortBy', params.sortBy ?? 'createdAt');
  searchParams.set('sortOrder', params.sortOrder ?? 'DESC');
  if (params.search?.trim()) searchParams.set('search', params.search.trim());

  return requestWithPagination<JobDescriptionSummary>(
    `/job-descriptions?${searchParams.toString()}`,
    {
      method: 'GET',
      accessToken,
    },
  );
}

export async function listJobPostings(
  accessToken: string,
  params: {
    page?: number;
    limit?: number;
    status?: string;
    sortBy?: string;
    sortOrder?: 'ASC' | 'DESC';
  } = {},
) {
  const searchParams = new URLSearchParams();
  searchParams.set('page', String(params.page ?? 1));
  searchParams.set('limit', String(params.limit ?? 20));
  searchParams.set('status', params.status ?? 'ALL');
  searchParams.set('sortBy', params.sortBy ?? 'createdAt');
  searchParams.set('sortOrder', params.sortOrder ?? 'DESC');

  return requestWithPagination<JobPostingSummary>(
    `/job-postings?${searchParams.toString()}`,
    {
      method: 'GET',
      accessToken,
    },
  );
}

export async function prepareChannelForm(
  accessToken: string,
  jobPostingId: string,
  channel: string,
) {
  return request<ChannelPrepareResult>(
    `/extension/job-postings/${encodeURIComponent(jobPostingId)}/channels/${encodeURIComponent(channel)}/prepare`,
    {
      method: 'POST',
      accessToken,
      headers: { 'X-Extension-Version': EXTENSION_VERSION },
    },
  );
}

export async function syncAndPublishAmisJob(
  accessToken: string,
  payload: SyncAmisJobPostingRequest,
) {
  const requestId = `ext-${crypto.randomUUID()}`;
  const idempotencyKey = `amis-${payload.amisRecruitmentId}-${crypto.randomUUID()}`;

  return request<ExtensionSyncResponse>('/extension/amis/job-postings/sync-and-publish', {
    method: 'POST',
    accessToken,
    body: payload,
    headers: {
      'Idempotency-Key': idempotencyKey,
      'X-Request-Id': requestId,
      'X-Extension-Version': EXTENSION_VERSION,
    },
  });
}

export async function previewAmisJobPublishPlan(
  accessToken: string,
  payload: SyncAmisJobPostingRequest,
) {
  const requestId = `ext-preview-${crypto.randomUUID()}`;

  return request<ExtensionPreviewPublishPlanResponse>('/extension/amis/job-postings/preview-plan', {
    method: 'POST',
    accessToken,
    body: payload,
    headers: {
      'X-Request-Id': requestId,
      'X-Extension-Version': EXTENSION_VERSION,
    },
  });
}

export async function syncAmisCareers(
  accessToken: string,
  payload: SyncAmisCareersRequest,
) {
  const requestId = `ext-careers-${crypto.randomUUID()}`;

  return request<SyncAmisCareersResponse>('/extension/amis/careers/sync', {
    method: 'POST',
    accessToken,
    body: payload,
    headers: {
      'X-Request-Id': requestId,
      'X-Extension-Version': EXTENSION_VERSION,
    },
  });
}

export async function syncAmisApplications(
  accessToken: string,
  payload: SyncAmisApplicationsRequest,
) {
  const requestId = `ext-applications-${crypto.randomUUID()}`;

  return request<SyncAmisApplicationsResponse>('/extension/amis/applications/sync', {
    method: 'POST',
    accessToken,
    body: payload,
    headers: {
      'X-Request-Id': requestId,
      'X-Extension-Version': EXTENSION_VERSION,
    },
  });
}

export async function syncVcsPortalJobDescriptions(accessToken: string) {
  const requestId = `ext-vcs-portal-jds-${crypto.randomUUID()}`;

  return request<SyncVcsPortalJdsResponse>('/extension/vcs-portal/jds/sync', {
    method: 'POST',
    accessToken,
    headers: {
      'X-Request-Id': requestId,
      'X-Extension-Version': EXTENSION_VERSION,
    },
  });
}

export async function getAmisApplicationsForRecruitment(
  accessToken: string,
  amisRecruitmentId: string,
) {
  return request<AmisApplicationsForRecruitment>(
    `/extension/amis/recruitments/${encodeURIComponent(amisRecruitmentId)}/applications`,
    {
      method: 'GET',
      accessToken,
    },
  );
}

export async function updateAmisApplicationStage(
  accessToken: string,
  payload: AmisCandidateStageChangedPayload,
) {
  return request<{ updated: boolean }>(
    `/extension/amis/recruitments/${encodeURIComponent(payload.amisRecruitmentId)}/applications/${encodeURIComponent(payload.amisCandidateId)}/stage`,
    {
      method: 'PATCH',
      accessToken,
      body: {
        recruitmentRoundId: payload.amisRecruitmentRoundId,
        recruitmentRoundName: payload.amisRecruitmentRoundName ?? undefined,
        status: payload.amisStatus ?? undefined,
        reasonRemoved: payload.reasonRemoved,
        sourceUrl: payload.sourceUrl,
        pageUrl: payload.pageUrl,
        changedAt: payload.changedAt,
        isTransitionEvent: payload.isTransitionEvent === true,
      },
    },
  );
}
export async function getReferralManagementSources(
  accessToken: string,
  source: ReferralManagementSource,
  params: { page?: number; limit?: number; search?: string; status?: 'ACTIVE' | 'INACTIVE' } = {},
) {
  const searchParams = new URLSearchParams({
    source,
    page: String(params.page ?? 1),
    limit: String(params.limit ?? 10),
  });
  if (params.search?.trim()) searchParams.set('search', params.search.trim());
  if (params.status) searchParams.set('status', params.status);

  return requestWithPagination<ReferralManagementPerson>(
    `/extension/amis/referral-sources?${searchParams.toString()}`,
    { method: 'GET', accessToken },
  ) as Promise<ReferralManagementPage>;
}

export async function createFreelancer(
  accessToken: string,
  payload: { name: string; email: string; phone?: string },
) {
  return request<CreatedFreelancerResult>('/extension/amis/referral-sources/freelancers', {
    method: 'POST',
    accessToken,
    body: payload,
  });
}

export async function createInternal(
  accessToken: string,
  payload: { name: string; email: string; phone: string },
) {
  return request<ReferralManagementPerson>('/extension/amis/referral-sources/internals', {
    method: 'POST',
    accessToken,
    body: payload,
  });
}

export async function updateFreelancerStatus(accessToken: string, freelancerId: string, isActive: boolean) {
  return request<ReferralManagementPerson>(`/extension/amis/referral-sources/freelancers/${encodeURIComponent(freelancerId)}/status`, {
    method: 'PATCH',
    accessToken,
    body: { isActive },
  });
}

export async function updateInternalStatus(accessToken: string, internalId: string, isActive: boolean) {
  return request<ReferralManagementPerson>(`/extension/amis/referral-sources/internals/${encodeURIComponent(internalId)}/status`, {
    method: 'PATCH',
    accessToken,
    body: { isActive },
  });
}

export async function runApplicationAiScreening(
  accessToken: string,
  applicationId: string,
) {
  return request<RunApplicationAiScreeningResponse>(
    `/applications/${encodeURIComponent(applicationId)}/ai-screening/run`,
    {
      method: 'POST',
      accessToken,
    },
  );
}

export async function getJobDescriptionQuestionSet(
  accessToken: string,
  jobDescriptionId: string,
) {
  return request<JobDescriptionQuestionSetContext>(
    `/extension/amis/job-descriptions/${encodeURIComponent(jobDescriptionId)}/question-set`,
    {
      method: 'GET',
      accessToken,
    },
  );
}

export async function getApplicationDetail(accessToken: string, applicationId: string) {
  return request<ApplicationDetailRecord>(
    `/applications/${encodeURIComponent(applicationId)}`,
    {
      method: 'GET',
      accessToken,
    },
  );
}

export async function getApplicationParsedProfile(accessToken: string, applicationId: string) {
  return request<ParsedProfileRecord | null>(
    `/applications/${encodeURIComponent(applicationId)}/parsed-profile`,
    {
      method: 'GET',
      accessToken,
    },
  );
}

export async function downloadCleanCvFile(
  accessToken: string,
  applicationId: string,
  cvDocumentId: string,
) {
  const path = `/applications/${encodeURIComponent(applicationId)}/cv/${encodeURIComponent(cvDocumentId)}/clean-file?disposition=attachment`;
  const headers = await buildHeaders(accessToken, { 'X-Extension-Version': EXTENSION_VERSION });

  let response;
  try {
    response = await axiosClient.request<ArrayBuffer>({
      url: path,
      method: 'GET',
      headers,
      responseType: 'arraybuffer',
      validateStatus: () => true,
    });
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    throw new ApiClientError('NETWORK_ERROR', (error as Error)?.message ?? 'Network error.', 0);
  }

  if (response.status < 200 || response.status >= 300) {
    let json: unknown = null;
    if (response.data instanceof ArrayBuffer) {
      try {
        const decoder = new TextDecoder('utf-8');
        const text = decoder.decode(response.data);
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }
    const envelope = isApiEnvelope(json) ? json : null;
    throw new ApiClientError(
      envelope?.error?.code ?? `HTTP_${response.status}`,
      envelope?.error?.message ?? 'Could not download clean CV file.',
      response.status,
      envelope?.error?.details ?? [],
    );
  }

  const contentDispositionHeader = getHeader(response.headers, 'content-disposition');
  const contentTypeHeader = getHeader(response.headers, 'content-type');

  return {
    fileName: readContentDispositionFileName(contentDispositionHeader) ?? 'clean-cv.pdf',
    mimeType: contentTypeHeader ?? 'application/pdf',
    data: response.data,
  };
}

export async function listAmisCareers(accessToken: string) {
  return request<AmisCareerCatalogItem[]>('/extension/amis/careers', {
    method: 'GET',
    accessToken,
  });
}

export async function reportFacebookPublishResult(
  accessToken: string,
  payload: FacebookPublishResultPayload,
) {
  return request<{ id: string; status: string }>('/extension/facebook/publish-results', {
    method: 'POST',
    accessToken,
    body: payload,
  });
}

export async function reserveFacebookPublishTarget(
  accessToken: string,
  payload: FacebookPublishReservationPayload,
) {
  return request<{ reservationId: string }>('/extension/facebook/publish-reservations', {
    method: 'POST',
    accessToken,
    body: payload,
  });
}

export async function listFacebookGroupPublishHistories(
  accessToken: string,
  targetId: string,
  params: { status?: FacebookReviewStatus | 'ALL'; page?: number; limit?: number } = {},
) {
  const searchParams = new URLSearchParams();
  if (params.status && params.status !== 'ALL') searchParams.set('status', params.status);
  searchParams.set('page', String(params.page ?? 1));
  searchParams.set('limit', String(params.limit ?? 10));

  return request<FacebookPublishHistoriesResponse>(
    `/extension/facebook/groups/${encodeURIComponent(targetId)}/publish-histories?${searchParams.toString()}`,
    {
      method: 'GET',
      accessToken,
    },
  );
}

export async function updateFacebookPublishHistoryStatusCheck(
  accessToken: string,
  historyId: string,
  payload: FacebookPublishHistoryStatusCheckRequest,
) {
  return request<FacebookPublishHistoryListItem>(
    `/extension/facebook/publish-histories/${encodeURIComponent(historyId)}/status-check`,
    {
      method: 'POST',
      accessToken,
      body: payload,
    },
  );
}

export async function resolveFacebookAccount(
  accessToken: string,
  payload: {
    facebookExternalId: string;
    displayName?: string | null;
    profileUrl?: string | null;
    avatarUrl?: string | null;
  },
) {
  return request<FacebookAccount>('/extension/facebook/accounts/resolve', {
    method: 'POST',
    accessToken,
    body: payload,
  });
}

export async function listFacebookAccounts(accessToken: string) {
  return request<FacebookAccount[]>('/extension/facebook/accounts', {
    method: 'GET',
    accessToken,
  });
}

export async function getFacebookGroups(accessToken: string, facebookAccountId?: string | null) {
  const query = facebookAccountId
    ? `?facebookAccountId=${encodeURIComponent(facebookAccountId)}`
    : '';
  return request<FacebookPublishTarget[]>(`/extension/facebook/groups${query}`, {
    method: 'GET',
    accessToken,
  });
}

export async function getFacebookGroupSyncState(accessToken: string, facebookAccountId?: string | null) {
  const query = facebookAccountId
    ? `?facebookAccountId=${encodeURIComponent(facebookAccountId)}`
    : '';
  return request<FacebookGroupSyncState>(`/extension/facebook/groups/sync-state${query}`, {
    method: 'GET',
    accessToken,
  });
}

export async function generateFacebookPreviewContent(
  accessToken: string,
  payload: {
    snapshot: AmisJobSnapshot;
    mode: 'TEMPLATE' | 'AI';
  },
) {
  return request<{ content: string; mode?: 'TEMPLATE' | 'AI' }>('/extension/facebook/generate-preview-content', {
    method: 'POST',
    accessToken,
    body: payload,
  });
}

export async function syncAmisJobStatus(
  accessToken: string,
  payload: {
    amisRecruitmentId: string;
    amisStatus: 1 | 2 | 3 | 5;
    sourceUrl?: string;
  },
) {
  const requestId = `ext-status-${crypto.randomUUID()}`;

  return request<{
    amisRecruitmentId: string;
    jobPostingId: string;
    amisStatus: number;
    status: string;
  }>('/extension/amis/job-postings/status-sync', {
    method: 'POST',
    accessToken,
    body: payload,
    headers: {
      'X-Request-Id': requestId,
      'X-Extension-Version': EXTENSION_VERSION,
    },
  });
}

export async function getAmisCareerQuestionContext(
  accessToken: string,
  amisCareerId: string,
) {
  return request<AmisCareerQuestionContext>(`/extension/amis/careers/${encodeURIComponent(amisCareerId)}/questions`, {
    method: 'GET',
    accessToken,
  });
}

export async function createAmisCareerQuestion(
  accessToken: string,
  amisCareerId: string,
  payload: CreateAmisCareerQuestionRequest,
) {
  return request<ExtensionQuestion>(`/extension/amis/careers/${encodeURIComponent(amisCareerId)}/questions`, {
    method: 'POST',
    accessToken,
    body: payload,
    headers: {
      'X-Extension-Version': EXTENSION_VERSION,
    },
  });
}

export async function createFacebookGroup(
  accessToken: string,
  payload: CreateFacebookGroupRequest,
) {
  return request<FacebookPublishTarget>('/extension/facebook/groups', {
    method: 'POST',
    accessToken,
    body: payload,
  });
}

export async function manuallyIncludeFacebookGroup(
  accessToken: string,
  payload: ManualIncludeFacebookGroupRequest,
) {
  return request<FacebookPublishTarget>('/extension/facebook/groups/manual-include', {
    method: 'POST',
    accessToken,
    body: payload,
  });
}

export async function discoverFacebookGroups(
  accessToken: string,
  payload: DiscoverFacebookGroupsRequest,
) {
  return request<DiscoverFacebookGroupsResponse>('/extension/facebook/groups/discover', {
    method: 'POST',
    accessToken,
    body: payload,
  });
}

export async function syncFacebookGroups(
  accessToken: string,
  payload: DiscoverFacebookGroupsRequest,
) {
  return request<DiscoverFacebookGroupsResponse>('/extension/facebook/groups/sync', {
    method: 'POST',
    accessToken,
    body: payload,
  });
}

export async function updateFacebookGroup(
  accessToken: string,
  targetId: string,
  payload: UpdateFacebookGroupRequest,
) {
  return request<FacebookPublishTarget>(`/extension/facebook/groups/${encodeURIComponent(targetId)}`, {
    method: 'PUT',
    accessToken,
    body: payload,
  });
}

export async function verifyFacebookGroup(
  accessToken: string,
  targetId: string,
  payload: VerifyFacebookGroupRequest,
) {
  return request<FacebookPublishTarget>(`/extension/facebook/groups/${encodeURIComponent(targetId)}/verify-result`, {
    method: 'POST',
    accessToken,
    body: payload,
  });
}

export async function deleteFacebookGroup(
  accessToken: string,
  targetId: string,
  facebookAccountId?: string | null,
) {
  const query = facebookAccountId
    ? `?facebookAccountId=${encodeURIComponent(facebookAccountId)}`
    : '';
  return request<FacebookPublishTarget>(`/extension/facebook/groups/${encodeURIComponent(targetId)}${query}`, {
    method: 'DELETE',
    accessToken,
  });
}

export const axiosClient = axios.create({
  baseURL: BE_API_BASE_URL,
});

async function request<T>(
  path: string,
  options: {
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    accessToken?: string;
    body?: unknown;
    headers?: Record<string, string>;
    skipExtensionInstanceHeader?: boolean;
  },
): Promise<T> {
  const headers = await buildHeaders(options.accessToken, options.headers, options.skipExtensionInstanceHeader);
  let response;
  try {
    response = await axiosClient.request({
      url: path,
      method: options.method,
      data: options.body,
      headers,
      validateStatus: () => true,
    });
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    throw new ApiClientError('NETWORK_ERROR', (error as Error)?.message ?? 'Network error.', 0);
  }

  if (response.status === 401 && shouldAttemptRefresh(path)) {
    const refreshedAccessToken = await refreshAccessToken();
    if (refreshedAccessToken) {
      const retryHeaders = await buildHeaders(refreshedAccessToken, options.headers, options.skipExtensionInstanceHeader);
      try {
        response = await axiosClient.request({
          url: path,
          method: options.method,
          data: options.body,
          headers: retryHeaders,
          validateStatus: () => true,
        });
      } catch (error) {
        if (error instanceof ApiClientError) throw error;
        throw new ApiClientError('NETWORK_ERROR', (error as Error)?.message ?? 'Network error.', 0);
      }
    }
  }

  const json = response.data;

  if (response.status < 200 || response.status >= 300) {
    const envelope = isApiEnvelope(json) ? json : null;
    throw new ApiClientError(
      envelope?.error?.code ?? `HTTP_${response.status}`,
      envelope?.error?.message ?? 'Request failed.',
      response.status,
      envelope?.error?.details ?? [],
    );
  }

  if (isApiEnvelope<T>(json) && json.success && json.data !== undefined) {
    return json.data;
  }

  return json as T;
}

async function requestWithPagination<T>(
  path: string,
  options: {
    method: 'GET';
    accessToken?: string;
    headers?: Record<string, string>;
    skipExtensionInstanceHeader?: boolean;
  },
): Promise<{ data: T[]; pagination: ApiPagination | null }> {
  const headers = await buildHeaders(options.accessToken, options.headers, options.skipExtensionInstanceHeader);
  let response;
  try {
    response = await axiosClient.request({
      url: path,
      method: options.method,
      headers,
      validateStatus: () => true,
    });
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    throw new ApiClientError('NETWORK_ERROR', (error as Error)?.message ?? 'Network error.', 0);
  }

  if (response.status === 401 && shouldAttemptRefresh(path)) {
    const refreshedAccessToken = await refreshAccessToken();
    if (refreshedAccessToken) {
      const retryHeaders = await buildHeaders(refreshedAccessToken, options.headers, options.skipExtensionInstanceHeader);
      try {
        response = await axiosClient.request({
          url: path,
          method: options.method,
          headers: retryHeaders,
          validateStatus: () => true,
        });
      } catch (error) {
        if (error instanceof ApiClientError) throw error;
        throw new ApiClientError('NETWORK_ERROR', (error as Error)?.message ?? 'Network error.', 0);
      }
    }
  }

  const json = response.data;

  if (response.status < 200 || response.status >= 300) {
    const envelope = isApiEnvelope(json) ? json : null;
    throw new ApiClientError(
      envelope?.error?.code ?? `HTTP_${response.status}`,
      envelope?.error?.message ?? 'Request failed.',
      response.status,
      envelope?.error?.details ?? [],
    );
  }

  if (isPaginatedEnvelope<T>(json)) {
    return {
      data: json.data ?? [],
      pagination: json.pagination,
    };
  }

  return {
    data: Array.isArray(json) ? (json as T[]) : [],
    pagination: null,
  };
}

async function buildHeaders(
  accessToken?: string,
  headers?: Record<string, string>,
  skipExtensionInstanceHeader = false,
) {
  const extensionInstanceId = skipExtensionInstanceHeader ? null : await getExtensionInstanceId();
  return {
    'Content-Type': 'application/json',
    ...(SHOULD_BYPASS_NGROK_WARNING ? { 'ngrok-skip-browser-warning': 'true' } : {}),
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...(extensionInstanceId ? { 'X-Extension-Instance-Id': extensionInstanceId } : {}),
    ...headers,
  };
}

function getHeader(headers: unknown, name: string): string | null {
  if (!headers || typeof headers !== 'object') return null;
  const h = headers as Record<string, unknown>;
  const val = h[name.toLowerCase()] ?? h[name] ?? h[name.toUpperCase()];
  return typeof val === 'string' ? val : null;
}

function getApiHost() {
  try {
    return new URL(BE_API_BASE_URL).hostname;
  } catch {
    return '';
  }
}

function shouldAttemptRefresh(path: string) {
  return !path.startsWith('/auth/login')
    && !path.startsWith('/auth/refresh')
    && !path.startsWith('/auth/logout');
}

export async function refreshAccessToken() {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return null;

  try {
    const headers = await buildHeaders(undefined, { 'X-Extension-Version': EXTENSION_VERSION });
    const response = await axiosClient.request({
      url: '/auth/refresh',
      method: 'POST',
      headers,
      data: { refreshToken },
      validateStatus: () => true,
    });

    if (response.status < 200 || response.status >= 300) {
      await clearAccessToken();
      return null;
    }

    const auth = isExtensionAuthResponse(response.data) ? response.data : null;
    if (!auth) {
      await clearAccessToken();
      return null;
    }

    await setAuthTokens({
      accessToken: auth.accessToken,
      refreshToken: auth.refreshToken,
    });
    return auth.accessToken;
  } catch {
    await clearAccessToken();
    return null;
  }
}

function isApiEnvelope<T = unknown>(value: unknown): value is ApiEnvelope<T> {
  return typeof value === 'object' && value !== null && 'success' in value;
}

function isPaginatedEnvelope<T>(value: unknown): value is ApiEnvelope<T[]> & { pagination: ApiPagination } {
  return isApiEnvelope<T[]>(value)
    && Array.isArray(value.data)
    && typeof (value as { pagination?: unknown }).pagination === 'object'
    && (value as { pagination?: unknown }).pagination !== null;
}

function isExtensionAuthResponse(value: unknown): value is { accessToken: string; refreshToken: string } {
  return typeof value === 'object'
    && value !== null
    && typeof (value as { accessToken?: unknown }).accessToken === 'string'
    && typeof (value as { refreshToken?: unknown }).refreshToken === 'string';
}

function readContentDispositionFileName(value: string | null) {
  if (!value) return null;

  const utf8Match = value.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1].replace(/^"|"$/g, ''));
    } catch {
      return utf8Match[1].replace(/^"|"$/g, '');
    }
  }

  return value.match(/filename="?([^";]+)"?/i)?.[1] ?? null;
}
