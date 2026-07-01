import { apiClient } from '@/lib/api-client';

interface ApiEnvelope<T> {
  success?: boolean;
  data: T;
  meta?: Record<string, unknown>;
}

export interface PublicJobPostingDetail {
  jobPostingId: string;
  title: string;
  status: string;
  publicSlug: string;
  summary?: string | null;
  description?: string | null;
  requirements?: unknown;
  benefits?: unknown;
  position?: {
    name?: string | null;
  } | null;
  level?: {
    name?: string | null;
    displayName?: string | null;
  } | null;
  location?: string | null;
  workingMode?: string | null;
  openAt?: string | null;
  closeAt?: string | null;
  applyUrl?: string | null;
}

export interface PublicApplicationPayload {
  fullName: string;
  email: string;
  phone: string;
  note?: string;
}

export interface PublicApplyResponse {
  accepted?: boolean;
  applicationId?: string;
  cvDocumentId?: string;
  status?: string;
  processingStatus?: string;
  nextStatus?: string;
  nextStep?: string;
  message?: string;
}

function unwrapEnvelope<T>(response: T | ApiEnvelope<T>): T {
  if (
    typeof response === 'object'
    && response !== null
    && 'data' in response
  ) {
    return (response as ApiEnvelope<T>).data;
  }

  return response as T;
}

export function getPublicJobPosting(slug: string) {
  return apiClient
    .get<ApiEnvelope<PublicJobPostingDetail>>(
      `/public/job-postings/${encodeURIComponent(slug)}`,
    )
    .then(unwrapEnvelope);
}

export function submitPublicApplication(
  jobPostingId: string,
  payload: PublicApplicationPayload,
  cvFile: File,
  idempotencyKey: string,
) {
  return apiClient
    .upload<ApiEnvelope<PublicApplyResponse>>(
      `/public/job-postings/${encodeURIComponent(jobPostingId)}/apply`,
      cvFile,
      'cvFile',
      {
        idempotencyKey,
        extraFields: {
          fullName: payload.fullName,
          email: payload.email,
          phone: payload.phone,
          note: payload.note,
        },
      },
    )
    .then(unwrapEnvelope);
}
