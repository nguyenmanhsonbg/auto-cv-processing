import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { copyFile, mkdir } from 'fs/promises';
import * as path from 'path';
import { DataSource, In, LessThan } from 'typeorm';
import { randomUUID } from 'crypto';
import { getCvSanitizerPoolConfig, CvSanitizerPoolConfig } from '../config/cv-sanitizer-pool.config';
import { CvSanitizationJobEntity } from '../jobs/cv-sanitization-job.entity';
import { CvSanitizationJobService } from '../jobs/cv-sanitization-job.service';
import {
  CvSanitizationJobStatus,
  isTerminalCvSanitizationJobStatus,
} from '../jobs/cv-sanitization-job-status';
import { CleanPdfOutputValidator } from '../output/clean-pdf-output-validator';
import { assertCvSafeFilePath } from '../storage/cv-safe-storage';
import { DockerCliSanitizerContainerRuntime } from '../worker-runtime/docker-cli-sanitizer-container-runtime';
import { ReservedCvSanitizationAssignment } from '../jobs/cv-sanitization-job.service';
import { CvSanitizerWorkerEntity } from '../workers/cv-sanitizer-worker.entity';
import { CvSanitizerWorkerStatus } from '../workers/cv-sanitizer-worker-status';
import { isCapacityCountingWorkerStatus } from '../workers/cv-sanitizer-worker-state';

@Injectable()
export class SanitizerPoolManagerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SanitizerPoolManagerService.name);
  private readonly config: CvSanitizerPoolConfig;
  private reconcileTimer: NodeJS.Timeout | null = null;
  private stopping = false;
  private reconciling = false;

  constructor(
    private readonly dataSource: DataSource,
    private readonly jobService: CvSanitizationJobService,
    private readonly runtime: DockerCliSanitizerContainerRuntime,
    private readonly outputValidator: CleanPdfOutputValidator,
  ) {
    this.config = getCvSanitizerPoolConfig();
  }

  async onModuleInit() {
    if (!this.config.poolEnabled || !this.config.poolManagerEnabled) {
      return;
    }

    this.logger.log('Starting CV sanitizer disposable pool manager');
    await this.startupReconcile();
    this.reconcileTimer = setInterval(() => {
      void this.reconcileOnce().catch((error) => {
        this.logger.error(`CV sanitizer pool reconcile failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      });
    }, this.config.reconcileIntervalMs);
    await this.reconcileOnce();
  }

  async onModuleDestroy() {
    this.stopping = true;
    if (this.reconcileTimer) {
      clearInterval(this.reconcileTimer);
      this.reconcileTimer = null;
    }

    if (!this.config.poolEnabled || !this.config.poolManagerEnabled) {
      return;
    }

    const workerRepo = this.dataSource.getRepository(CvSanitizerWorkerEntity);
    const activeWorkers = await workerRepo.find({
      where: {
        status: In([
          CvSanitizerWorkerStatus.STARTING,
          CvSanitizerWorkerStatus.READY,
          CvSanitizerWorkerStatus.RESERVED,
          CvSanitizerWorkerStatus.PROCESSING,
        ]),
      },
    });

    for (const worker of activeWorkers) {
      await this.runtime.terminateWorker(this.config, worker.runtimeContainerId, worker.id);
      await workerRepo.update(
        { id: worker.id },
        {
          status: CvSanitizerWorkerStatus.TERMINATED,
          terminatedAt: new Date(),
          leaseExpiresAt: null,
        },
      );
    }
  }

  async reconcileOnce() {
    if (this.stopping || this.reconciling) return;
    this.reconciling = true;

    try {
      await this.jobService.recoverExpiredLeases();
      await this.recoverExpiredWorkerLeases();
      await this.maintainReadyCapacity();
      await this.assignQueuedJobs();
    } finally {
      this.reconciling = false;
    }
  }

  private async startupReconcile() {
    const workerRepo = this.dataSource.getRepository(CvSanitizerWorkerEntity);
    const removedOrphans = await this.runtime.removeOrphanWorkers(this.config);
    if (removedOrphans > 0) {
      this.logger.warn(`Removed ${removedOrphans} orphan CV sanitizer worker containers`);
    }

    await workerRepo.update(
      {
        status: In([
          CvSanitizerWorkerStatus.STARTING,
          CvSanitizerWorkerStatus.READY,
          CvSanitizerWorkerStatus.RESERVED,
          CvSanitizerWorkerStatus.PROCESSING,
          CvSanitizerWorkerStatus.TERMINATING,
        ]),
      },
      {
        status: CvSanitizerWorkerStatus.FAILED,
        failureReason: 'Pool manager startup reconciliation invalidated previous worker.',
        leaseExpiresAt: null,
        terminatedAt: new Date(),
      },
    );
    await this.jobService.recoverActiveWorkerJobs(new Date());
    await this.jobService.recoverExpiredLeases(new Date());
  }

  private async maintainReadyCapacity() {
    const workerRepo = this.dataSource.getRepository(CvSanitizerWorkerEntity);
    const workers = await workerRepo.find({
      where: {
        status: In([
          CvSanitizerWorkerStatus.STARTING,
          CvSanitizerWorkerStatus.READY,
          CvSanitizerWorkerStatus.RESERVED,
          CvSanitizerWorkerStatus.PROCESSING,
        ]),
      },
    });
    let readyOrStarting = workers.filter((worker) => [
      CvSanitizerWorkerStatus.STARTING,
      CvSanitizerWorkerStatus.READY,
    ].includes(worker.status)).length;
    let capacity = workers.filter((worker) => isCapacityCountingWorkerStatus(worker.status)).length;

    while (
      !this.stopping &&
      readyOrStarting < this.config.minReadyWorkers &&
      capacity < this.config.maxWorkers
    ) {
      const created = await this.createReadyWorker();
      if (!created) return;
      capacity += 1;
      readyOrStarting += 1;
    }
  }

  private async createReadyWorker() {
    const workerRepo = this.dataSource.getRepository(CvSanitizerWorkerEntity);
    const worker = await workerRepo.save(workerRepo.create({
      id: randomUUID(),
      runtimeType: 'DOCKER_CLI',
      runtimeContainerId: null,
      runtimeContainerName: null,
      status: CvSanitizerWorkerStatus.STARTING,
      currentJobId: null,
      readyAt: null,
      reservedAt: null,
      startedAt: null,
      terminatedAt: null,
      lastHeartbeatAt: null,
      leaseExpiresAt: null,
      failureReason: null,
    }));

    try {
      const created = await this.runtime.createWorker({
        workerId: worker.id,
        config: this.config,
      });
      await workerRepo.update(
        { id: worker.id },
        {
          status: CvSanitizerWorkerStatus.READY,
          runtimeContainerId: created.containerId,
          runtimeContainerName: created.containerName,
          readyAt: new Date(),
          lastHeartbeatAt: new Date(),
        },
      );
      return true;
    } catch (error) {
      await workerRepo.update(
        { id: worker.id },
        {
          status: CvSanitizerWorkerStatus.FAILED,
          failureReason: error instanceof Error ? error.message.slice(0, 500) : 'Worker start failed.',
          terminatedAt: new Date(),
        },
      );
      return false;
    }
  }

  private async assignQueuedJobs() {
    for (let index = 0; index < this.config.maxWorkers && !this.stopping; index += 1) {
      const assignment = await this.reserveAssignment();
      if (!assignment) return;
      void this.processAssignment(assignment);
    }
  }

  private async reserveAssignment() {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const assignment = await this.jobService.reserveNextAssignment(
        queryRunner,
        new Date(Date.now() + this.config.jobTimeoutMs),
      );
      await queryRunner.commitTransaction();
      return assignment;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async processAssignment(assignment: ReservedCvSanitizationAssignment) {
    const { job, worker } = assignment;
    const workerRepo = this.dataSource.getRepository(CvSanitizerWorkerEntity);
    const leaseExpiresAt = new Date(Date.now() + this.config.jobTimeoutMs);

    try {
      await workerRepo.update(
        { id: worker.id },
        {
          status: CvSanitizerWorkerStatus.PROCESSING,
          startedAt: new Date(),
          lastHeartbeatAt: new Date(),
          leaseExpiresAt,
        },
      );
      await this.jobService.markProcessing(job.id, worker.id, leaseExpiresAt);

      const preparedJob = await this.runtime.prepareJob({
        config: this.config,
        workerId: worker.id,
        job,
      });
      const result = await this.runtime.waitForResult(
        this.config,
        worker.id,
        worker.runtimeContainerId ?? '',
        this.config.jobTimeoutMs,
      );
      const latestJob = await this.jobService.findById(job.id);
      if (!latestJob || isTerminalCvSanitizationJobStatus(latestJob.status)) {
        await this.markWorkerFailed(worker.id, 'Job became terminal before worker result was applied.');
        return;
      }

      if (result.status === 'SANITIZED' && result.outputFileName === preparedJob.outputFileName) {
        const tempArtifact = await this.outputValidator.validate(
          preparedJob.outputFilePath,
          path.dirname(preparedJob.outputFilePath),
        );
        const safeOutputPath = assertCvSafeFilePath(job.outputFilePath);
        await mkdir(path.dirname(safeOutputPath), { recursive: true });
        await copyFile(tempArtifact.filePath, safeOutputPath);
        const safeArtifact = await this.outputValidator.validate(safeOutputPath);
        await this.jobService.markSucceeded(job.id, { outputHash: safeArtifact.sha256 });
        await this.markWorkerTerminated(worker.id);
        return;
      }

      await this.jobService.failOrRetry(job.id, {
        errorCode: result.reasonCode || 'GHOSTSCRIPT_SANITIZE_FAILED',
        errorMessageSafe: result.errorMessageSafe,
        containerExitCode: result.exitCode ?? null,
      });
      await this.markWorkerFailed(worker.id, result.reasonCode || 'GHOSTSCRIPT_SANITIZE_FAILED');
    } catch (error) {
      await this.jobService.failOrRetry(job.id, {
        errorCode: error instanceof Error && error.message === 'WORKER_START_FAILED'
          ? 'WORKER_START_FAILED'
          : 'CONTAINER_RUNTIME_ERROR',
        errorMessageSafe: error instanceof Error ? error.message : 'CV sanitizer pool assignment failed.',
      });
      await this.markWorkerFailed(worker.id, error instanceof Error ? error.message : 'Assignment failed.');
    } finally {
      await this.runtime.terminateWorker(this.config, worker.runtimeContainerId, worker.id);
    }
  }

  private async recoverExpiredWorkerLeases() {
    const workerRepo = this.dataSource.getRepository(CvSanitizerWorkerEntity);
    const expiredWorkers = await workerRepo.find({
      where: {
        status: In([
          CvSanitizerWorkerStatus.RESERVED,
          CvSanitizerWorkerStatus.PROCESSING,
        ]),
        leaseExpiresAt: LessThan(new Date()),
      },
      take: 100,
    });

    for (const worker of expiredWorkers) {
      await this.runtime.terminateWorker(this.config, worker.runtimeContainerId, worker.id);
      await this.markWorkerFailed(worker.id, 'Worker lease expired.');
    }
  }

  private async markWorkerTerminated(workerId: string) {
    await this.dataSource.getRepository(CvSanitizerWorkerEntity).update(
      { id: workerId },
      {
        status: CvSanitizerWorkerStatus.TERMINATED,
        currentJobId: null,
        leaseExpiresAt: null,
        terminatedAt: new Date(),
      },
    );
  }

  private async markWorkerFailed(workerId: string, failureReason: string) {
    await this.dataSource.getRepository(CvSanitizerWorkerEntity).update(
      { id: workerId },
      {
        status: CvSanitizerWorkerStatus.FAILED,
        currentJobId: null,
        leaseExpiresAt: null,
        terminatedAt: new Date(),
        failureReason: failureReason.slice(0, 500),
      },
    );
  }
}
