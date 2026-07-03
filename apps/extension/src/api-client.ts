import { BE_API_BASE_URL, EXTENSION_VERSION } from './config';
import type {
  ApiEnvelope,
  ApiPagination,
  AmisCareerCatalogItem,
  AmisCareerQuestionContext,
  CreateAmisCareerQuestionRequest,
  CreateFacebookGroupRequest,
  ExtensionQuestion,
  ExtensionSyncResponse,
  ExtensionUser,
  FacebookPublishTarget,
  FacebookPublishResultPayload,
  JobDescriptionSummary,
  SyncAmisCareersRequest,
  SyncAmisCareersResponse,
  SyncAmisJobPostingRequest,
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
  return request<{ accessToken: string; user: ExtensionUser }>('/auth/login', {
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

export async function listJobDescriptions(
  accessToken: string,
  params: { page?: number; limit?: number; search?: string } = {},
) {
  const searchParams = new URLSearchParams();
  searchParams.set('page', String(params.page ?? 1));
  searchParams.set('limit', String(params.limit ?? 20));
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
  },
): Promise<T> {
  const response = await fetch(`${BE_API_BASE_URL}${path}`, {
    method: options.method,
    headers: {
      'Content-Type': 'application/json',
      ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
      ...options.headers,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

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
  },
): Promise<{ data: T[]; pagination: ApiPagination | null }> {
  const response = await fetch(`${BE_API_BASE_URL}${path}`, {
    method: options.method,
    headers: {
      'Content-Type': 'application/json',
      ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
      ...options.headers,
    },
  });

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
