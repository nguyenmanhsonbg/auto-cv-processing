import {
  CvSanitizerWorkerStatus,
  TERMINAL_CV_SANITIZER_WORKER_STATUSES,
} from './cv-sanitizer-worker-status';

export function isTerminalCvSanitizerWorkerStatus(status: CvSanitizerWorkerStatus) {
  return TERMINAL_CV_SANITIZER_WORKER_STATUSES.includes(
    status as (typeof TERMINAL_CV_SANITIZER_WORKER_STATUSES)[number],
  );
}

export function isCapacityCountingWorkerStatus(status: CvSanitizerWorkerStatus) {
  return [
    CvSanitizerWorkerStatus.STARTING,
    CvSanitizerWorkerStatus.READY,
    CvSanitizerWorkerStatus.RESERVED,
    CvSanitizerWorkerStatus.PROCESSING,
  ].includes(status);
}
