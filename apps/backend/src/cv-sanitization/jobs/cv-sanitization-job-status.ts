export enum CvSanitizationJobStatus {
  QUEUED = 'QUEUED',
  ASSIGNED = 'ASSIGNED',
  PROCESSING = 'PROCESSING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  TIMEOUT = 'TIMEOUT',
  RETRY_PENDING = 'RETRY_PENDING',
  CANCELLED = 'CANCELLED',
}

export const TERMINAL_CV_SANITIZATION_JOB_STATUSES = [
  CvSanitizationJobStatus.SUCCEEDED,
  CvSanitizationJobStatus.FAILED,
  CvSanitizationJobStatus.TIMEOUT,
  CvSanitizationJobStatus.CANCELLED,
] as const;

export function isTerminalCvSanitizationJobStatus(status: CvSanitizationJobStatus) {
  return TERMINAL_CV_SANITIZATION_JOB_STATUSES.includes(
    status as (typeof TERMINAL_CV_SANITIZATION_JOB_STATUSES)[number],
  );
}
