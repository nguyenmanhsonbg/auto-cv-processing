import type {
  PaginatedRecruitmentResult,
  RecruitmentPagination,
} from '@/lib/recruitment-api';

export interface ApiEnvelope<T> {
  success?: boolean;
  data: T;
  pagination?: RecruitmentPagination;
  meta?: Record<string, unknown>;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isApiEnvelope<T>(response: T | ApiEnvelope<T>): response is ApiEnvelope<T> {
  return isRecord(response) && 'data' in response;
}

export function unwrapEnvelope<T>(response: T | ApiEnvelope<T>): T {
  return isApiEnvelope(response) ? response.data : response as T;
}

export function readPagination(response: unknown): RecruitmentPagination | undefined {
  if (!isRecord(response)) return undefined;

  const pagination = response.pagination;
  if (isRecord(pagination)) {
    return toPagination(pagination);
  }

  if ('total' in response || 'totalPages' in response) {
    return toPagination(response);
  }

  return undefined;
}

function toPagination(value: Record<string, unknown>): RecruitmentPagination {
  return {
    page: Number(value.page ?? 1),
    limit: Number(value.limit ?? 20),
    total: Number(value.total ?? 0),
    totalPages: Number(value.totalPages ?? 1),
  };
}

export function unwrapPaginated<TInput, TOutput = TInput>(
  response: unknown,
  mapItem: (item: TInput) => TOutput = (item) => item as unknown as TOutput,
): PaginatedRecruitmentResult<TOutput> {
  if (Array.isArray(response)) {
    return { data: response.map((item) => mapItem(item as TInput)) };
  }

  if (!isRecord(response)) return { data: [] };

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

export function getStatusFilter(isActive?: boolean) {
  if (isActive === undefined) return undefined;
  return isActive ? 'ACTIVE' : 'INACTIVE';
}
