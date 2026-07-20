export enum CvSanitizerWorkerStatus {
  STARTING = 'STARTING',
  READY = 'READY',
  RESERVED = 'RESERVED',
  PROCESSING = 'PROCESSING',
  TERMINATING = 'TERMINATING',
  TERMINATED = 'TERMINATED',
  FAILED = 'FAILED',
}

export const TERMINAL_CV_SANITIZER_WORKER_STATUSES = [
  CvSanitizerWorkerStatus.TERMINATED,
  CvSanitizerWorkerStatus.FAILED,
] as const;
