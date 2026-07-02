import { BE_API_BASE_URL, EXTENSION_VERSION } from './config';
import type {
  ApiEnvelope,
  CreateFacebookGroupRequest,
  ExtensionSyncResponse,
  ExtensionUser,
  FacebookPublishTarget,
  FacebookPublishResultPayload,
  SyncAmisJobPostingRequest,
  UpdateFacebookGroupRequest,
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
