export interface PaginationResult {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginationInput {
  page?: number;
  limit?: number;
}

export interface ReferenceListQuery {
  page?: string;
  limit?: string;
  search?: string;
  status?: string;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

export function normalizePagination(input: PaginationInput) {
  const page = Math.max(1, input.page ?? 1);
  const limit = Math.min(100, Math.max(1, input.limit ?? 20));
  return { page, limit };
}

export function totalPages(total: number, limit: number) {
  return Math.ceil(total / limit);
}

export function normalizeReferenceListQuery(query: ReferenceListQuery) {
  const statuses = query.status ? query.status.split(',').filter(Boolean) : [];
  let isActive: boolean | undefined;
  if (statuses.length === 1) {
    if (statuses[0] === 'ACTIVE') {
      isActive = true;
    } else if (statuses[0] === 'INACTIVE') {
      isActive = false;
    }
  }

  return {
    page: query.page ? Number(query.page) : undefined,
    limit: query.limit ? Number(query.limit) : undefined,
    search: query.search,
    isActive,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
  };
}

export function paginatedSuccess<T>(
  data: T[],
  pagination: PaginationResult,
  meta: Record<string, unknown>,
) {
  return {
    success: true,
    data,
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total: pagination.total,
      totalPages: pagination.totalPages,
    },
    meta,
  };
}
