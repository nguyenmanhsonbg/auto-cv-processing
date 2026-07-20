import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { DataSource, In, LessThan, QueryFailedError, QueryRunner } from 'typeorm';
import { CvSanitizerWorkerEntity } from '../workers/cv-sanitizer-worker.entity';
import { CvSanitizerWorkerStatus } from '../workers/cv-sanitizer-worker-status';
import { CvSanitizationJobEntity } from './cv-sanitization-job.entity';
import {
  CvSanitizationJobStatus,
  isTerminalCvSanitizationJobStatus,
} from './cv-sanitization-job-status';

export interface CreateCvSanitizationJobInput {
  applicationId: string;
  originalCvDocumentId: string;
  originalFileHash: string;
  sourceFilePath: string;
  sourceStoragePath: string;
  sourceMimeType: string;
  outputFilePath: string;
  outputStoragePath: string;
  maxAttempts: number;
}

export interface ReservedCvSanitizationAssignment {
  job: CvSanitizationJobEntity;
  worker: CvSanitizerWorkerEntity;
}

export interface CompleteCvSanitizationJobInput {
  outputHash: string;
}

export interface FailCvSanitizationJobInput {
  errorCode: string;
  errorMessageSafe?: string | null;
  containerExitCode?: number | null;
  retryable?: boolean;
}

const ACTIVE_JOB_STATUSES = [
  CvSanitizationJobStatus.QUEUED,
  CvSanitizationJobStatus.ASSIGNED,
  CvSanitizationJobStatus.PROCESSING,
  CvSanitizationJobStatus.RETRY_PENDING,
];

const ASSIGNABLE_JOB_STATUSES = [
  CvSanitizationJobStatus.QUEUED,
  CvSanitizationJobStatus.RETRY_PENDING,
];

const LEASED_JOB_STATUSES = [
  CvSanitizationJobStatus.ASSIGNED,
  CvSanitizationJobStatus.PROCESSING,
];

const RETRYABLE_ERROR_CODES = new Set([
  'WORKER_START_FAILED',
  'WORKER_CRASHED',
  'GHOSTSCRIPT_TRANSIENT_FAILURE',
  'CONTAINER_RUNTIME_ERROR',
  'SANITIZER_TIMEOUT',
]);

@Injectable()
export class CvSanitizationJobService {
  constructor(private readonly dataSource: DataSource) {}

  async createOrReuseJob(input: CreateCvSanitizationJobInput) {
    const inputHash = this.buildInputHash(input);
    const existingJob = await this.findActiveJob(input.applicationId, input.originalCvDocumentId, inputHash);
    if (existingJob) return existingJob;

    const repo = this.dataSource.getRepository(CvSanitizationJobEntity);
    try {
      return await repo.save(repo.create({
        applicationId: input.applicationId,
        originalCvDocumentId: input.originalCvDocumentId,
        status: CvSanitizationJobStatus.QUEUED,
        attempt: 0,
        maxAttempts: input.maxAttempts,
        inputHash,
        sourceFilePath: input.sourceFilePath,
        sourceStoragePath: input.sourceStoragePath,
        sourceMimeType: input.sourceMimeType,
        outputFilePath: input.outputFilePath,
        outputStoragePath: input.outputStoragePath,
        outputHash: null,
        errorCode: null,
        errorMessageSafe: null,
        containerExitCode: null,
        workerId: null,
        assignedAt: null,
        startedAt: null,
        finishedAt: null,
        leaseExpiresAt: null,
      }));
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        const racedJob = await this.findActiveJob(input.applicationId, input.originalCvDocumentId, inputHash);
        if (racedJob) return racedJob;
      }
      throw error;
    }
  }

  async reserveNextAssignment(
    queryRunner: QueryRunner,
    leaseExpiresAt: Date,
  ): Promise<ReservedCvSanitizationAssignment | null> {
    const manager = queryRunner.manager;
    const job = await manager
      .createQueryBuilder(CvSanitizationJobEntity, 'job')
      .where('job.status IN (:...statuses)', { statuses: ASSIGNABLE_JOB_STATUSES })
      .orderBy('job.queuedAt', 'ASC')
      .setLock('pessimistic_write')
      .setOnLocked('skip_locked')
      .getOne();

    if (!job) return null;

    const worker = await manager
      .createQueryBuilder(CvSanitizerWorkerEntity, 'worker')
      .where('worker.status = :status', { status: CvSanitizerWorkerStatus.READY })
      .orderBy('worker.readyAt', 'ASC')
      .setLock('pessimistic_write')
      .setOnLocked('skip_locked')
      .getOne();

    if (!worker) return null;

    const now = new Date();
    worker.status = CvSanitizerWorkerStatus.RESERVED;
    worker.currentJobId = job.id;
    worker.reservedAt = now;
    worker.leaseExpiresAt = leaseExpiresAt;
    await manager.getRepository(CvSanitizerWorkerEntity).save(worker);

    job.status = CvSanitizationJobStatus.ASSIGNED;
    job.workerId = worker.id;
    job.attempt += 1;
    job.assignedAt = now;
    job.leaseExpiresAt = leaseExpiresAt;
    job.errorCode = null;
    job.errorMessageSafe = null;
    job.containerExitCode = null;
    await manager.getRepository(CvSanitizationJobEntity).save(job);

    return { job, worker };
  }

  async markProcessing(jobId: string, workerId: string, leaseExpiresAt: Date) {
    await this.dataSource.getRepository(CvSanitizationJobEntity).update(
      { id: jobId },
      {
        status: CvSanitizationJobStatus.PROCESSING,
        workerId,
        startedAt: new Date(),
        leaseExpiresAt,
      },
    );
  }

  async markSucceeded(jobId: string, input: CompleteCvSanitizationJobInput) {
    await this.dataSource.getRepository(CvSanitizationJobEntity).update(
      { id: jobId },
      {
        status: CvSanitizationJobStatus.SUCCEEDED,
        outputHash: input.outputHash,
        errorCode: null,
        errorMessageSafe: null,
        containerExitCode: null,
        leaseExpiresAt: null,
        finishedAt: new Date(),
      },
    );
  }

  async attachCleanCvDocument(jobId: string, cleanCvDocumentId: string) {
    await this.dataSource.getRepository(CvSanitizationJobEntity).update(
      { id: jobId },
      { cleanCvDocumentId },
    );
  }

  async failOrRetry(jobId: string, input: FailCvSanitizationJobInput) {
    const repo = this.dataSource.getRepository(CvSanitizationJobEntity);
    const job = await repo.findOne({ where: { id: jobId } });
    if (!job || isTerminalCvSanitizationJobStatus(job.status)) return job;

    const retryable = input.retryable ?? isRetryableSanitizationError(input.errorCode);
    const nextStatus = retryable && job.attempt < job.maxAttempts
      ? CvSanitizationJobStatus.RETRY_PENDING
      : CvSanitizationJobStatus.FAILED;
    const now = new Date();

    await repo.update(
      { id: jobId },
      {
        status: nextStatus,
        workerId: nextStatus === CvSanitizationJobStatus.RETRY_PENDING ? null : job.workerId,
        errorCode: input.errorCode,
        errorMessageSafe: sanitizeSafeMessage(input.errorMessageSafe),
        containerExitCode: input.containerExitCode ?? null,
        leaseExpiresAt: null,
        finishedAt: nextStatus === CvSanitizationJobStatus.FAILED ? now : null,
        queuedAt: nextStatus === CvSanitizationJobStatus.RETRY_PENDING ? now : job.queuedAt,
      },
    );

    return repo.findOne({ where: { id: jobId } });
  }

  async markTimedOut(jobId: string, reasonCode = 'SANITIZER_TIMEOUT') {
    await this.dataSource.getRepository(CvSanitizationJobEntity).update(
      { id: jobId, status: In(ACTIVE_JOB_STATUSES) },
      {
        status: CvSanitizationJobStatus.TIMEOUT,
        errorCode: reasonCode,
        errorMessageSafe: 'CV sanitization timed out.',
        leaseExpiresAt: null,
        finishedAt: new Date(),
      },
    );
  }

  async waitForTerminalJob(jobId: string, timeoutMs: number) {
    const repo = this.dataSource.getRepository(CvSanitizationJobEntity);
    const deadline = Date.now() + timeoutMs;

    while (Date.now() <= deadline) {
      const job = await repo.findOne({ where: { id: jobId } });
      if (!job) throw new Error('CV sanitization job not found');
      if (isTerminalCvSanitizationJobStatus(job.status)) return job;
      await sleep(500);
    }

    await this.markTimedOut(jobId, 'SANITIZER_POOL_WAIT_TIMEOUT');
    const timedOutJob = await repo.findOne({ where: { id: jobId } });
    if (!timedOutJob) throw new Error('CV sanitization job not found');
    return timedOutJob;
  }

  async recoverExpiredLeases(now = new Date()) {
    const repo = this.dataSource.getRepository(CvSanitizationJobEntity);
    const expiredJobs = await repo.find({
      where: {
        status: In(LEASED_JOB_STATUSES),
        leaseExpiresAt: LessThan(now),
      },
      take: 100,
    });

    for (const job of expiredJobs) {
      if (job.attempt < job.maxAttempts) {
        await repo.update(
          { id: job.id },
          {
            status: CvSanitizationJobStatus.RETRY_PENDING,
            workerId: null,
            leaseExpiresAt: null,
            errorCode: 'SANITIZER_TIMEOUT',
            errorMessageSafe: 'CV sanitizer worker lease expired.',
            queuedAt: now,
          },
        );
        continue;
      }

      await repo.update(
        { id: job.id },
        {
          status: CvSanitizationJobStatus.TIMEOUT,
          leaseExpiresAt: null,
          errorCode: 'SANITIZER_TIMEOUT',
          errorMessageSafe: 'CV sanitizer worker lease expired.',
          finishedAt: now,
        },
      );
    }

    return expiredJobs.length;
  }

  async recoverActiveWorkerJobs(now = new Date()) {
    const repo = this.dataSource.getRepository(CvSanitizationJobEntity);
    const activeWorkerJobs = await repo.find({
      where: {
        status: In(LEASED_JOB_STATUSES),
      },
      take: 100,
    });

    for (const job of activeWorkerJobs) {
      if (job.attempt < job.maxAttempts) {
        await repo.update(
          { id: job.id },
          {
            status: CvSanitizationJobStatus.RETRY_PENDING,
            workerId: null,
            leaseExpiresAt: null,
            errorCode: 'WORKER_CRASHED',
            errorMessageSafe: 'CV sanitizer worker was unavailable during pool startup recovery.',
            queuedAt: now,
          },
        );
        continue;
      }

      await repo.update(
        { id: job.id },
        {
          status: CvSanitizationJobStatus.FAILED,
          leaseExpiresAt: null,
          errorCode: 'WORKER_CRASHED',
          errorMessageSafe: 'CV sanitizer worker was unavailable during pool startup recovery.',
          finishedAt: now,
        },
      );
    }

    return activeWorkerJobs.length;
  }

  findById(jobId: string) {
    return this.dataSource.getRepository(CvSanitizationJobEntity).findOne({
      where: { id: jobId },
    });
  }

  async countQueuedJobs() {
    return this.dataSource.getRepository(CvSanitizationJobEntity).count({
      where: { status: In(ASSIGNABLE_JOB_STATUSES) },
    });
  }

  private findActiveJob(applicationId: string, originalCvDocumentId: string, inputHash: string) {
    return this.dataSource.getRepository(CvSanitizationJobEntity).findOne({
      where: {
        applicationId,
        originalCvDocumentId,
        inputHash,
        status: In(ACTIVE_JOB_STATUSES),
      },
      order: {
        createdAt: 'DESC',
      },
    });
  }

  private buildInputHash(input: CreateCvSanitizationJobInput) {
    return createHash('sha256')
      .update(input.applicationId)
      .update('|')
      .update(input.originalCvDocumentId)
      .update('|')
      .update(input.originalFileHash || input.sourceStoragePath)
      .update('|')
      .update(input.sourceMimeType)
      .digest('hex');
  }

  private isUniqueViolation(error: unknown) {
    return error instanceof QueryFailedError
      && typeof (error as QueryFailedError & { code?: string }).code === 'string'
      && (error as QueryFailedError & { code?: string }).code === '23505';
  }
}

export function isRetryableSanitizationError(errorCode: string) {
  return RETRYABLE_ERROR_CODES.has(errorCode);
}

function sanitizeSafeMessage(value?: string | null) {
  const normalized = value?.trim();
  if (!normalized) return null;
  return normalized.slice(0, 500);
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}
