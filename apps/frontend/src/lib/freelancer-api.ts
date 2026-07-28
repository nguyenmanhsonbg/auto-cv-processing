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

interface ApiFreelancerUser {
  userId: string;
  name: string;
  email: string;
  role: string;
}

interface ApiFreelancerRecord {
  freelancerId: string;
  identifier: string;
  isActive: boolean;
  applicationCount: number;
  user: ApiFreelancerUser;
  createdBy?: {
    userId: string;
    name: string;
    email: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

interface ApiCreateFreelancerResponse extends ApiFreelancerRecord {
  initialPassword: string;
}

interface ApiFreelancerApplicationRecord {
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

export interface FreelancerRecord {
  id: string;
  identifier: string;
  name: string;
  email: string;
  isActive: boolean;
  applicationCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface FreelancerApplicationRecord {
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

export interface CreateFreelancerResponse extends FreelancerRecord {
  initialPassword: string;
}

export interface ListFreelancersParams {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean;
}

export interface CreateFreelancerPayload {
  name: string;
  email: string;
}

export interface ListFreelancerApplicationsParams {
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

function unwrapPaginated<TInput, TOutput>(
  response: unknown,
  mapItem: (item: TInput) => TOutput,
): PaginatedRecruitmentResult<TOutput> {
  if (Array.isArray(response)) {
    return {
      data: response.map((item) => mapItem(item as TInput)),
    };
  }

  if (!isRecord(response)) {
    return { data: [] };
  }

  const pagination = readPagination(response);
  const data = response.data;

  if (Array.isArray(data)) {
    return {
      data: data.map((item) => mapItem(item as TInput)),
      pagination,
    };
  }

  if (isRecord(data) && Array.isArray(data.data)) {
    return {
      data: data.data.map((item) => mapItem(item as TInput)),
      pagination: readPagination(data) ?? pagination,
    };
  }

  return { data: [], pagination };
}

function mapFreelancerRecord(response: ApiFreelancerRecord): FreelancerRecord {
  return {
    id: response.freelancerId,
    identifier: response.identifier,
    name: response.user.name,
    email: response.user.email,
    isActive: response.isActive,
    applicationCount: response.applicationCount,
    createdAt: response.createdAt,
    updatedAt: response.updatedAt,
  };
}

function mapCreateFreelancerResponse(
  response: ApiCreateFreelancerResponse,
): CreateFreelancerResponse {
  return {
    ...mapFreelancerRecord(response),
    initialPassword: response.initialPassword,
  };
}

function mapFreelancerApplicationRecord(
  response: ApiFreelancerApplicationRecord,
): FreelancerApplicationRecord {
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

export function listFreelancers(
  params: ListFreelancersParams = {},
) {
  return apiClient
    .get<unknown>('/freelancers', {
      page: params.page,
      limit: params.limit,
      search: params.search,
      status: params.isActive === undefined
        ? undefined
        : params.isActive
          ? 'ACTIVE'
          : 'INACTIVE',
    })
    .then((response) => unwrapPaginated<ApiFreelancerRecord, FreelancerRecord>(
      response,
      mapFreelancerRecord,
    ));
}

export function createFreelancer(payload: CreateFreelancerPayload) {
  return apiClient
    .post<ApiEnvelope<ApiCreateFreelancerResponse> | ApiCreateFreelancerResponse>(
      '/freelancers',
      payload,
    )
    .then((response) => mapCreateFreelancerResponse(unwrapEnvelope(response)));
}

export function getFreelancer(id: string) {
  return apiClient
    .get<ApiEnvelope<ApiFreelancerRecord> | ApiFreelancerRecord>(
      `/freelancers/${encodeURIComponent(id)}`,
    )
    .then((response) => mapFreelancerRecord(unwrapEnvelope(response)));
}

export function getMyFreelancer() {
  return apiClient
    .get<ApiEnvelope<ApiFreelancerRecord> | ApiFreelancerRecord>(
      '/freelancers/me/summary',
    )
    .then((response) => mapFreelancerRecord(unwrapEnvelope(response)));
}

export function listFreelancerApplications(
  id: string,
  params: ListFreelancerApplicationsParams = {},
) {
  return apiClient
    .get<unknown>(
      `/freelancers/${encodeURIComponent(id)}/applications`,
      {
        page: params.page,
        limit: params.limit,
        search: params.search,
      },
    )
    .then((response) => unwrapPaginated<
      ApiFreelancerApplicationRecord,
      FreelancerApplicationRecord
    >(
      response,
      mapFreelancerApplicationRecord,
    ));
}

export function listMyFreelancerApplications(
  params: ListFreelancerApplicationsParams = {},
) {
  return apiClient
    .get<unknown>(
      '/freelancers/me/applications',
      {
        page: params.page,
        limit: params.limit,
        search: params.search,
      },
    )
    .then((response) => unwrapPaginated<
      ApiFreelancerApplicationRecord,
      FreelancerApplicationRecord
    >(
      response,
      mapFreelancerApplicationRecord,
    ));
}

export function updateFreelancerStatus(id: string, isActive: boolean) {
  return apiClient
    .patch<ApiEnvelope<ApiFreelancerRecord> | ApiFreelancerRecord>(
      `/freelancers/${encodeURIComponent(id)}/status`,
      { isActive },
    )
    .then((response) => mapFreelancerRecord(unwrapEnvelope(response)));
}

export function updateMyFreelancerApplicationEvaluation(
  referralId: string,
  evaluation: string | null,
) {
  return apiClient
    .patch<ApiEnvelope<ApiFreelancerApplicationRecord> | ApiFreelancerApplicationRecord>(
      `/freelancers/me/applications/${encodeURIComponent(referralId)}/evaluation`,
      { evaluation },
    )
    .then((response) => mapFreelancerApplicationRecord(unwrapEnvelope(response)));
}

export function downloadMyFreelancerCv(referralId: string) {
  return apiClient.downloadBlob(
    `/freelancers/me/applications/${encodeURIComponent(referralId)}/cv?disposition=inline`,
  );
}
