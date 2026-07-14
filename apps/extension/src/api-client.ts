import { BE_API_BASE_URL, EXTENSION_CAPABILITIES, EXTENSION_VERSION } from './config';
import { clearAccessToken, getRefreshToken, setAuthTokens } from './auth-store';
import {
  clearExtensionInstanceId,
  getExtensionDisplayName,
  getExtensionInstanceId,
  getExtensionInstanceMetadata,
  getOrCreateInstallId,
  setExtensionInstanceId,
} from './extension-instance-store';
import type {
  ApiEnvelope,
  ApiPagination,
  AmisApplicationsForRecruitment,
  AmisCareerCatalogItem,
  AmisCareerQuestionContext,
  CreateAmisCareerQuestionRequest,
  CreateFacebookGroupRequest,
  DiscoverFacebookGroupsRequest,
  DiscoverFacebookGroupsResponse,
  ExtensionInstance,
  ExtensionQuestion,
  ExtensionSyncResponse,
  ExtensionTask,
  ExtensionUser,
  FacebookPublishHistoriesResponse,
  FacebookPublishHistoryStatusCheckRequest,
  FacebookPublishHistoryListItem,
  FacebookReviewStatus,
  FacebookPublishTarget,
  FacebookPublishResultPayload,
  JobDescriptionQuestionSetContext,
  JobDescriptionSummary,
  SyncAmisApplicationsRequest,
  SyncAmisApplicationsResponse,
  SyncAmisCareersRequest,
  SyncAmisCareersResponse,
  SyncAmisJobPostingRequest,
  SyncVcsPortalJdsResponse,
  UpdateFacebookGroupRequest,
  VerifyFacebookGroupRequest,
} from './types';

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

export async function login(email: string, password: string) {
  return request<{ accessToken: string; refreshToken: string; user: ExtensionUser }>('/auth/login', {
    method: 'POST',
    body: { email, password },
  });
}

export async function getCurrentUser(accessToken: string) {
  return request<ExtensionUser>('/auth/me', {
    method: 'GET',
    accessToken,
  });
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
  searchParams.set('sourceSystem', params.sourceSystem ?? 'VCS_PORTAL');
  searchParams.set('status', params.status ?? 'ACTIVE');
  searchParams.set('latestSyncedOnly', String(params.latestSyncedOnly ?? true));
  searchParams.set('sortBy', params.sortBy ?? 'lastSyncedAt');
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

export async function downloadCleanCvFile(
  accessToken: string,
  applicationId: string,
  cvDocumentId: string,
) {
  const response = await fetch(
    `${BE_API_BASE_URL}/applications/${encodeURIComponent(applicationId)}/cv/${encodeURIComponent(cvDocumentId)}/clean-file?disposition=attachment`,
    {
      method: 'GET',
      headers: await buildJsonHeaders(accessToken, { 'X-Extension-Version': EXTENSION_VERSION }),
    },
  );

  if (!response.ok) {
    const json = await readJson(response);
    const envelope = isApiEnvelope(json) ? json : null;
    throw new ApiClientError(
      envelope?.error?.code ?? `HTTP_${response.status}`,
      envelope?.error?.message ?? 'Could not download clean CV file.',
      response.status,
      envelope?.error?.details ?? [],
    );
  }

  return {
    fileName: readContentDispositionFileName(response.headers.get('Content-Disposition')) ?? 'clean-cv.pdf',
    mimeType: response.headers.get('Content-Type') ?? 'application/pdf',
    data: await response.arrayBuffer(),
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

export async function getFacebookGroups(accessToken: string) {
  return request<FacebookPublishTarget[]>('/extension/facebook/groups', {
    method: 'GET',
    accessToken,
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

export async function deleteFacebookGroup(accessToken: string, targetId: string) {
  return request<FacebookPublishTarget>(`/extension/facebook/groups/${encodeURIComponent(targetId)}`, {
    method: 'DELETE',
    accessToken,
  });
}

async function request<T>(
  path: string,
  options: {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    accessToken?: string;
    body?: unknown;
    headers?: Record<string, string>;
    skipExtensionInstanceHeader?: boolean;
  },
): Promise<T> {
  const body = options.body === undefined ? undefined : JSON.stringify(options.body);
  let response = await fetch(`${BE_API_BASE_URL}${path}`, {
    method: options.method,
    headers: await buildJsonHeaders(options.accessToken, options.headers, options.skipExtensionInstanceHeader),
    body,
  });

  if (response.status === 401 && shouldAttemptRefresh(path)) {
    const refreshedAccessToken = await refreshAccessToken();
    if (refreshedAccessToken) {
      response = await fetch(`${BE_API_BASE_URL}${path}`, {
        method: options.method,
        headers: await buildJsonHeaders(refreshedAccessToken, options.headers, options.skipExtensionInstanceHeader),
        body,
      });
    }
  }

  const json = await readJson(response);

  if (!response.ok) {
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
  let response = await fetch(`${BE_API_BASE_URL}${path}`, {
    method: options.method,
    headers: await buildJsonHeaders(options.accessToken, options.headers, options.skipExtensionInstanceHeader),
  });

  if (response.status === 401 && shouldAttemptRefresh(path)) {
    const refreshedAccessToken = await refreshAccessToken();
    if (refreshedAccessToken) {
      response = await fetch(`${BE_API_BASE_URL}${path}`, {
        method: options.method,
        headers: await buildJsonHeaders(refreshedAccessToken, options.headers, options.skipExtensionInstanceHeader),
      });
    }
  }

  const json = await readJson(response);

  if (!response.ok) {
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
    data: Array.isArray(json) ? json as T[] : [],
    pagination: null,
  };
}

async function buildJsonHeaders(
  accessToken?: string,
  headers?: Record<string, string>,
  skipExtensionInstanceHeader = false,
) {
  const extensionInstanceId = skipExtensionInstanceHeader ? null : await getExtensionInstanceId();
  return {
    'Content-Type': 'application/json',
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...(extensionInstanceId ? { 'X-Extension-Instance-Id': extensionInstanceId } : {}),
    ...headers,
  };
}

function shouldAttemptRefresh(path: string) {
  return !path.startsWith('/auth/login')
    && !path.startsWith('/auth/refresh')
    && !path.startsWith('/auth/logout');
}

async function refreshAccessToken() {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return null;

  const response = await fetch(`${BE_API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: await buildJsonHeaders(undefined, { 'X-Extension-Version': EXTENSION_VERSION }),
    body: JSON.stringify({ refreshToken }),
  });
  const json = await readJson(response);

  if (!response.ok) {
    await clearAccessToken();
    return null;
  }

  const auth = isExtensionAuthResponse(json) ? json : null;
  if (!auth) {
    await clearAccessToken();
    return null;
  }

  await setAuthTokens({
    accessToken: auth.accessToken,
    refreshToken: auth.refreshToken,
  });
  return auth.accessToken;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiClientError('INVALID_JSON_RESPONSE', 'Backend returned invalid JSON.', response.status);
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
