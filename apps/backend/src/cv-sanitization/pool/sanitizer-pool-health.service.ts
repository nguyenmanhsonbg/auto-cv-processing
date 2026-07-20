import { Injectable } from '@nestjs/common';
import { DataSource, In, LessThan } from 'typeorm';
import { getCvSanitizerPoolConfig } from '../config/cv-sanitizer-pool.config';
import { CvSanitizationJobService } from '../jobs/cv-sanitization-job.service';
import { DockerCliSanitizerContainerRuntime } from '../worker-runtime/docker-cli-sanitizer-container-runtime';
import { CvSanitizerWorkerEntity } from '../workers/cv-sanitizer-worker.entity';
import { CvSanitizerWorkerStatus } from '../workers/cv-sanitizer-worker-status';

export type SanitizerPoolHealthStatus = 'UP' | 'DEGRADED' | 'DOWN';

export interface SanitizerPoolHealthSummary {
  status: SanitizerPoolHealthStatus;
  poolManagerRunning: boolean;
  runtimeReachable: boolean;
  workerImage: string;
  readyWorkerCount: number;
  queuedJobCount: number;
  staleWorkerCount: number;
}

@Injectable()
export class SanitizerPoolHealthService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly jobService: CvSanitizationJobService,
    private readonly runtime: DockerCliSanitizerContainerRuntime,
  ) {}

  async getSummary(): Promise<SanitizerPoolHealthSummary> {
    const config = getCvSanitizerPoolConfig();
    const workerRepo = this.dataSource.getRepository(CvSanitizerWorkerEntity);
    const [runtimeReachable, readyWorkerCount, queuedJobCount, staleWorkerCount] = await Promise.all([
      this.runtime.isRuntimeReachable(config),
      workerRepo.count({ where: { status: CvSanitizerWorkerStatus.READY } }),
      this.jobService.countQueuedJobs(),
      workerRepo.count({
        where: {
          status: In([
            CvSanitizerWorkerStatus.RESERVED,
            CvSanitizerWorkerStatus.PROCESSING,
          ]),
          leaseExpiresAt: LessThan(new Date()),
        },
      }),
    ]);

    return {
      status: resolveHealthStatus(runtimeReachable, readyWorkerCount, config.minReadyWorkers),
      poolManagerRunning: config.poolEnabled && config.poolManagerEnabled,
      runtimeReachable,
      workerImage: config.workerImage,
      readyWorkerCount,
      queuedJobCount,
      staleWorkerCount,
    };
  }
}

function resolveHealthStatus(
  runtimeReachable: boolean,
  readyWorkerCount: number,
  minReadyWorkers: number,
): SanitizerPoolHealthStatus {
  if (!runtimeReachable) return 'DOWN';
  if (readyWorkerCount >= minReadyWorkers) return 'UP';
  return 'DEGRADED';
}
