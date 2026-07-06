import { apiClient } from '@/lib/api-client';

export interface FormQuestion {
  questionSetItemId: string;
  questionId: string | null;
  text: string;
  type: string;
  required: boolean;
  options: { id: string; text: string }[] | null;
}

export interface FormSessionDetails {
  formSessionId: string;
  expiresAt: string;
  status: string;
  candidateName: string;
  jobTitle: string;
  questions: FormQuestion[];
}

export interface FormSubmitAnswer {
  questionSetItemId: string;
  answer: Record<string, any>;
}

interface ApiEnvelope<T> {
  success?: boolean;
  data: T;
}

function unwrapEnvelope<T>(response: T | ApiEnvelope<T>): T {
  if (
    typeof response === 'object' &&
    response !== null &&
    'data' in response
  ) {
    return (response as ApiEnvelope<T>).data;
  }
  return response as T;
}

export function getPublicForm(token: string): Promise<FormSessionDetails> {
  return apiClient
    .get<ApiEnvelope<FormSessionDetails>>(`/public/form-sessions/${encodeURIComponent(token)}`)
    .then(unwrapEnvelope);
}

export function submitPublicForm(
  token: string,
  answers: FormSubmitAnswer[],
): Promise<{ success: boolean }> {
  return apiClient
    .post<ApiEnvelope<{ success: boolean }>>(
      `/public/form-sessions/${encodeURIComponent(token)}/submit`,
      { answers },
    )
    .then(unwrapEnvelope);
}

export function generateFormSession(
  applicationId: string,
): Promise<{ formSessionId: string; plainToken: string; formUrl: string; expiresAt: string }> {
  return apiClient
    .post<ApiEnvelope<{
      formSessionId: string;
      plainToken: string;
      formUrl: string;
      expiresAt: string;
    }>>('/form-sessions/generate', { applicationId })
    .then(unwrapEnvelope);
}

export interface FormAdminQuestion {
  questionSetItemId: string;
  text: string;
  type: string;
  required: boolean;
  options: { id: string; text: string }[] | null;
  answer: Record<string, any> | null;
  answeredAt: string | null;
}

export interface FormAdminDetails {
  formSessionId: string;
  expiresAt: string;
  status: string;
  sentAt: string;
  openedAt: string | null;
  submittedAt: string | null;
  questions: FormAdminQuestion[];
}

export function getFormDetailsForAdmin(
  applicationId: string,
): Promise<FormAdminDetails | null> {
  return apiClient
    .get<ApiEnvelope<FormAdminDetails | null>>(`/form-sessions/application/${encodeURIComponent(applicationId)}`)
    .then(unwrapEnvelope);
}
