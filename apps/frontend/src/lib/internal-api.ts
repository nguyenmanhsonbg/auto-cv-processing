import { apiClient } from '@/lib/api-client';
import type {
  PaginatedRecruitmentResult,
  RecruitmentPagination,
} from '@/lib/recruitment-api';

interface ApiEnvelope<T> {
  success?: boolean;
  data: T;
  pagination?: RecruitmentPagination;
  meta?: Record<string, unknown>;
}

interface ApiInternalRecord {
  internalId: string;
  email: string;
  isActive: boolean;
  applicationCount: number;
  createdAt: string;
  updatedAt: string;
}

interface ApiInternalApplicationRecord {
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
  processStatus: string | null;
  hrReceptionStatus: string | null;
  evaluation: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InternalRecord {
  id: string;
  email: string;
  isActive: boolean;
  applicationCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface InternalApplicationRecord {
  referralId: string;
  applicationId: string;
  candidateName: string;
  jobPostingTitle: string;
  processStatus: string | null;
  hrReceptionStatus: string | null;
  evaluation: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListInternalsParams {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean;
}

export interface CreateInternalPayload {
  email: string;
}

export interface ListInternalApplicationsParams {
  page?: number;
  limit?: number;
  search?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isApiEnvelope<T>(response: T | ApiEnvelope<T>): response is ApiEnvelope<T> {
  return isRecord(response) && 'data' in response;
}

function unwrapEnvelope<T>(response: T | ApiEnvelope<T>): T {
  return isApiEnvelope(response) ? response.data : response as T;
}

function readPagination(response: unknown): RecruitmentPagination | undefined {
  if (!isRecord(response)) return undefined;
  const pagination = response.pagination;
  if (!isRecord(pagination)) return undefined;
  return {
    page: Number(pagination.page ?? 1),
    limit: Number(pagination.limit ?? 20),
    total: Number(pagination.total ?? 0),
    totalPages: Number(pagination.totalPages ?? 1),
  };
}

function unwrapPaginated<TInput, TOutput>(
  response: unknown,
  mapItem: (item: TInput) => TOutput,
): PaginatedRecruitmentResult<TOutput> {
  if (!isRecord(response)) return { data: [] };
  const pagination = readPagination(response);
  return {
    data: Array.isArray(response.data)
      ? response.data.map((item) => mapItem(item as TInput))
      : [],
    pagination,
  };
}

function mapInternalRecord(response: ApiInternalRecord): InternalRecord {
  return {
    id: response.internalId,
    email: response.email,
    isActive: response.isActive,
    applicationCount: response.applicationCount,
    createdAt: response.createdAt,
    updatedAt: response.updatedAt,
  };
}

function mapInternalApplicationRecord(
  response: ApiInternalApplicationRecord,
): InternalApplicationRecord {
  return {
    referralId: response.referralId,
    applicationId: response.applicationId,
    candidateName: response.candidate.fullName,
    jobPostingTitle: response.jobPosting.title,
    processStatus: response.processStatus,
    hrReceptionStatus: response.hrReceptionStatus,
    evaluation: response.evaluation,
    createdAt: response.createdAt,
    updatedAt: response.updatedAt,
  };
}

export function listInternals(params: ListInternalsParams = {}) {
  return apiClient
    .get<unknown>('/internals', {
      page: params.page,
      limit: params.limit,
      search: params.search,
      status: params.isActive === undefined
        ? undefined
        : params.isActive
          ? 'ACTIVE'
          : 'INACTIVE',
    })
    .then((response) => unwrapPaginated<ApiInternalRecord, InternalRecord>(
      response,
      mapInternalRecord,
    ));
}

export function createInternal(payload: CreateInternalPayload) {
  return apiClient
    .post<ApiEnvelope<ApiInternalRecord> | ApiInternalRecord>('/internals', payload)
    .then((response) => mapInternalRecord(unwrapEnvelope(response)));
}

export function getInternal(id: string) {
  return apiClient
    .get<ApiEnvelope<ApiInternalRecord> | ApiInternalRecord>(
      `/internals/${encodeURIComponent(id)}`,
    )
    .then((response) => mapInternalRecord(unwrapEnvelope(response)));
}

export function listInternalApplications(
  id: string,
  params: ListInternalApplicationsParams = {},
) {
  return apiClient
    .get<unknown>(`/internals/${encodeURIComponent(id)}/applications`, {
      page: params.page,
      limit: params.limit,
      search: params.search,
    })
    .then((response) => unwrapPaginated<
      ApiInternalApplicationRecord,
      InternalApplicationRecord
    >(response, mapInternalApplicationRecord));
}

export function updateInternalStatus(id: string, isActive: boolean) {
  return apiClient
    .patch<ApiEnvelope<ApiInternalRecord> | ApiInternalRecord>(
      `/internals/${encodeURIComponent(id)}/status`,
      { isActive },
    )
    .then((response) => mapInternalRecord(unwrapEnvelope(response)));
}
