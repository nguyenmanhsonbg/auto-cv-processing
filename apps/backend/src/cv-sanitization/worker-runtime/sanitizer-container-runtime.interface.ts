import { CvSanitizerPoolConfig } from '../config/cv-sanitizer-pool.config';
import { CvSanitizationJobEntity } from '../jobs/cv-sanitization-job.entity';

export interface CreatedSanitizerWorker {
  workerId: string;
  containerId: string;
  containerName: string;
}

export interface PreparedSanitizerJob {
  inputFileName: string;
  outputFileName: string;
  outputFilePath: string;
}

export interface SanitizerWorkerResult {
  status: 'SANITIZED' | 'FAILED';
  outputFileName?: string | null;
  exitCode?: number | null;
  reasonCode?: string | null;
  errorMessageSafe?: string | null;
  durationMs?: number | null;
}

export interface CreateSanitizerWorkerInput {
  workerId: string;
  config: CvSanitizerPoolConfig;
}

export interface PrepareSanitizerJobInput {
  config: CvSanitizerPoolConfig;
  workerId: string;
  job: CvSanitizationJobEntity;
}

export interface SanitizerContainerRuntime {
  isRuntimeReachable(config: CvSanitizerPoolConfig): Promise<boolean>;
  createWorker(input: CreateSanitizerWorkerInput): Promise<CreatedSanitizerWorker>;
  prepareJob(input: PrepareSanitizerJobInput): Promise<PreparedSanitizerJob>;
  waitForResult(
    config: CvSanitizerPoolConfig,
    workerId: string,
    containerId: string,
    timeoutMs: number,
  ): Promise<SanitizerWorkerResult>;
  terminateWorker(
    config: CvSanitizerPoolConfig,
    containerId?: string | null,
    workerId?: string | null,
  ): Promise<void>;
  removeOrphanWorkers(config: CvSanitizerPoolConfig): Promise<number>;
  cleanupWorkerWorkspace(config: CvSanitizerPoolConfig, workerId: string): Promise<void>;
}
