import { apiClient } from '@/lib/api-client';
import {
  getStatusFilter,
  unwrapEnvelope,
  unwrapPaginated,
} from '@/lib/api-response-helpers';
import type { ApiEnvelope } from '@/lib/api-response-helpers';

interface ApiInternalRecord {
  internalId: string;
  name: string | null;
  email: string;
  phone: string | null;
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
  name: string | null;
  email: string;
  phone: string | null;
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
  name: string;
  email: string;
  phone: string;
}

export interface ListInternalApplicationsParams {
  page?: number;
  limit?: number;
  search?: string;
}

function mapInternalRecord(response: ApiInternalRecord): InternalRecord {
  return {
    id: response.internalId,
    name: response.name,
    email: response.email,
    phone: response.phone,
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
      status: getStatusFilter(params.isActive),
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
