import { getCvSanitizerPoolConfig } from '../config/cv-sanitizer-pool.config';
import { CvSanitizationJobService } from '../jobs/cv-sanitization-job.service';
import { CvSanitizationJobStatus } from '../jobs/cv-sanitization-job-status';
import {
  CleanCvSanitizer,
  CleanCvSanitizeInput,
  CleanCvSanitizeResult,
  CleanCvSanitizeStatus,
} from './clean-cv-sanitizer.interface';

const SANITIZER_NAME = 'disposable-ghostscript-sanitizer';
const PDF_MIME_TYPE = 'application/pdf';

export class DisposableGhostscriptSanitizer implements CleanCvSanitizer {
  constructor(private readonly jobService: CvSanitizationJobService) {}

  async sanitize(input: CleanCvSanitizeInput): Promise<CleanCvSanitizeResult> {
    const startedAt = Date.now();

    if (input.sourceMimeType !== PDF_MIME_TYPE) {
      return this.failed(startedAt, 'UNSUPPORTED_SANITIZER_INPUT');
    }

    const config = getCvSanitizerPoolConfig();
    if (!config.poolEnabled) {
      return this.failed(startedAt, 'SANITIZER_POOL_NOT_ENABLED');
    }

    const job = await this.jobService.createOrReuseJob({
      applicationId: input.applicationId,
      originalCvDocumentId: input.cvDocumentId,
      originalFileHash: input.originalFileHash,
      sourceFilePath: input.sourceFilePath,
      sourceStoragePath: input.sourceStoragePath,
      sourceMimeType: input.sourceMimeType,
      outputFilePath: input.outputFilePath,
      outputStoragePath: input.outputStoragePath,
      maxAttempts: config.maxAttempts,
    });
    const terminalJob = await this.jobService.waitForTerminalJob(job.id, config.jobWaitTimeoutMs);
    const durationMs = Date.now() - startedAt;

    if (terminalJob.status === CvSanitizationJobStatus.SUCCEEDED) {
      return {
        status: CleanCvSanitizeStatus.SANITIZED,
        sanitizer: SANITIZER_NAME,
        sanitizedAt: terminalJob.finishedAt ?? new Date(),
        durationMs,
        outputFilePath: terminalJob.outputFilePath,
        outputMimeType: PDF_MIME_TYPE,
        reasonCode: null,
        sanitizationJobId: terminalJob.id,
        workerId: terminalJob.workerId,
        attempt: terminalJob.attempt,
      };
    }

    return this.failed(
      startedAt,
      terminalJob.errorCode || this.toReasonCode(terminalJob.status),
      terminalJob.id,
      terminalJob.workerId,
      terminalJob.attempt,
    );
  }

  private toReasonCode(status: CvSanitizationJobStatus) {
    if (status === CvSanitizationJobStatus.TIMEOUT) return 'SANITIZER_TIMEOUT';
    if (status === CvSanitizationJobStatus.CANCELLED) return 'JOB_CANCELLED';
    return 'CV_SANITIZE_FAILED';
  }

  private failed(
    startedAt: number,
    reasonCode: string,
    sanitizationJobId?: string | null,
    workerId?: string | null,
    attempt?: number | null,
  ): CleanCvSanitizeResult {
    return {
      status: CleanCvSanitizeStatus.FAILED,
      sanitizer: SANITIZER_NAME,
      sanitizedAt: new Date(),
      durationMs: Date.now() - startedAt,
      outputFilePath: null,
      outputMimeType: null,
      reasonCode,
      sanitizationJobId: sanitizationJobId ?? null,
      workerId: workerId ?? null,
      attempt: attempt ?? null,
    };
  }
}
