import { Injectable } from '@nestjs/common';
import { spawn } from 'child_process';
import { copyFile, chmod, mkdir, readFile, rm, writeFile } from 'fs/promises';
import * as path from 'path';
import { CvSanitizerPoolConfig } from '../config/cv-sanitizer-pool.config';
import {
  CreatedSanitizerWorker,
  CreateSanitizerWorkerInput,
  PreparedSanitizerJob,
  PrepareSanitizerJobInput,
  SanitizerContainerRuntime,
  SanitizerWorkerResult,
} from './sanitizer-container-runtime.interface';

const COMPONENT_LABEL = 'vcs.component=cv-sanitizer-worker';
const INPUT_FILE_NAME = 'input.pdf';
const OUTPUT_FILE_NAME = 'output.pdf';

@Injectable()
export class DockerCliSanitizerContainerRuntime implements SanitizerContainerRuntime {
  async isRuntimeReachable(config: CvSanitizerPoolConfig) {
    try {
      await spawnCollect(config.dockerCommand, ['version', '--format', '{{.Server.Version}}'], 10_000);
      return true;
    } catch {
      return false;
    }
  }

  async createWorker(input: CreateSanitizerWorkerInput): Promise<CreatedSanitizerWorker> {
    const { config, workerId } = input;
    const dirs = getWorkerDirs(config, workerId);
    await rm(dirs.root, { recursive: true, force: true });
    await mkdir(dirs.control, { recursive: true });
    await mkdir(dirs.input, { recursive: true });
    await mkdir(dirs.output, { recursive: true });
    await makeWritableForContainer(dirs.root);
    await makeWritableForContainer(dirs.control);
    await makeWritableForContainer(dirs.input);
    await makeWritableForContainer(dirs.output);

    const containerName = `vcs-cv-sanitizer-${workerId}`;
    const containerId = (await spawnCollect(config.dockerCommand, [
      'run',
      '-d',
      '--name',
      containerName,
      '--network',
      'none',
      '--user',
      '65534:65534',
      '--read-only',
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges',
      '--pids-limit',
      '128',
      '--memory',
      '512m',
      '--cpus',
      '1',
      '--tmpfs',
      '/tmp:rw,noexec,nosuid,size=64m',
      '--label',
      COMPONENT_LABEL,
      '--label',
      `vcs.workerId=${workerId}`,
      '--label',
      `vcs.version=${config.version}`,
      '-v',
      `${dirs.control}:/control:rw`,
      '-v',
      `${dirs.input}:/input:ro`,
      '-v',
      `${dirs.output}:/output:rw`,
      config.workerImage,
    ], config.readyTimeoutMs)).stdout.trim();

    await this.waitForWorkerReady(config, workerId, containerId);
    return {
      workerId,
      containerId,
      containerName,
    };
  }

  async prepareJob(input: PrepareSanitizerJobInput): Promise<PreparedSanitizerJob> {
    const dirs = getWorkerDirs(input.config, input.workerId);
    await rm(path.join(dirs.control, 'job.json'), { force: true });
    await rm(path.join(dirs.control, 'result.json'), { force: true });
    await rm(path.join(dirs.input, INPUT_FILE_NAME), { force: true });
    await rm(path.join(dirs.output, OUTPUT_FILE_NAME), { force: true });
    await copyFile(input.job.sourceFilePath, path.join(dirs.input, INPUT_FILE_NAME));

    const descriptor = {
      jobId: input.job.id,
      inputFileName: INPUT_FILE_NAME,
      outputFileName: OUTPUT_FILE_NAME,
      sourceMimeType: input.job.sourceMimeType,
      requestedAt: new Date().toISOString(),
    };
    await writeFile(
      path.join(dirs.control, 'job.json'),
      `${JSON.stringify(descriptor)}\n`,
      'utf8',
    );

    return {
      inputFileName: INPUT_FILE_NAME,
      outputFileName: OUTPUT_FILE_NAME,
      outputFilePath: path.join(dirs.output, OUTPUT_FILE_NAME),
    };
  }

  async waitForResult(
    config: CvSanitizerPoolConfig,
    workerId: string,
    containerId: string,
    timeoutMs: number,
  ): Promise<SanitizerWorkerResult> {
    const dirs = getWorkerDirs(config, workerId);
    let exitCode: number | null = null;

    try {
      const waitResult = await spawnCollect(config.dockerCommand, ['wait', containerId], timeoutMs);
      const parsedExitCode = Number(waitResult.stdout.trim());
      exitCode = Number.isFinite(parsedExitCode) ? parsedExitCode : null;
    } catch (error) {
      if (error instanceof SpawnTimeoutError) {
        return {
          status: 'FAILED',
          exitCode: null,
          reasonCode: 'SANITIZER_TIMEOUT',
          errorMessageSafe: 'CV sanitizer worker timed out.',
        };
      }
      return {
        status: 'FAILED',
        exitCode: null,
        reasonCode: 'CONTAINER_RUNTIME_ERROR',
        errorMessageSafe: 'CV sanitizer worker wait failed.',
      };
    }

    try {
      const rawResult = await readFile(path.join(dirs.control, 'result.json'), 'utf8');
      const result = JSON.parse(rawResult) as SanitizerWorkerResult;
      return {
        status: result.status === 'SANITIZED' ? 'SANITIZED' : 'FAILED',
        outputFileName: result.outputFileName ?? null,
        exitCode: result.exitCode ?? exitCode,
        reasonCode: result.reasonCode ?? null,
        errorMessageSafe: result.errorMessageSafe ?? null,
        durationMs: result.durationMs ?? null,
      };
    } catch {
      return {
        status: 'FAILED',
        exitCode,
        reasonCode: exitCode === 0 ? 'OUTPUT_VALIDATION_FAILED' : 'WORKER_CRASHED',
        errorMessageSafe: 'CV sanitizer worker did not produce a valid result descriptor.',
      };
    }
  }

  async terminateWorker(
    config: CvSanitizerPoolConfig,
    containerId?: string | null,
    workerId?: string | null,
  ) {
    if (containerId) {
      await spawnCollect(config.dockerCommand, ['rm', '-f', containerId], 30_000).catch(() => undefined);
    }
    if (workerId) {
      await this.cleanupWorkerWorkspace(config, workerId);
    }
  }

  async removeOrphanWorkers(config: CvSanitizerPoolConfig) {
    const result = await spawnCollect(config.dockerCommand, [
      'ps',
      '-aq',
      '--filter',
      `label=${COMPONENT_LABEL}`,
    ], 30_000).catch(() => ({ stdout: '' }));

    const containerIds = result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (containerIds.length === 0) return 0;

    await spawnCollect(config.dockerCommand, ['rm', '-f', ...containerIds], 30_000).catch(() => undefined);
    return containerIds.length;
  }

  cleanupWorkerWorkspace(config: CvSanitizerPoolConfig, workerId: string) {
    return rm(getWorkerDirs(config, workerId).root, { recursive: true, force: true });
  }

  private async waitForWorkerReady(
    config: CvSanitizerPoolConfig,
    workerId: string,
    containerId: string,
  ) {
    const dirs = getWorkerDirs(config, workerId);
    const deadline = Date.now() + config.readyTimeoutMs;

    while (Date.now() <= deadline) {
      try {
        await readFile(path.join(dirs.control, 'ready.json'), 'utf8');
        return;
      } catch {
        await sleep(250);
      }
    }

    await this.terminateWorker(config, containerId, workerId);
    throw new Error('WORKER_START_FAILED');
  }
}

function getWorkerDirs(config: CvSanitizerPoolConfig, workerId: string) {
  return {
    root: path.join(config.controlDir, workerId),
    control: path.join(config.controlDir, workerId, 'control'),
    input: path.join(config.controlDir, workerId, 'input'),
    output: path.join(config.controlDir, workerId, 'output'),
  };
}

async function makeWritableForContainer(dir: string) {
  if (process.platform === 'win32') return;
  await chmod(dir, 0o777).catch(() => undefined);
}

function spawnCollect(command: string, args: string[], timeoutMs: number) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new SpawnTimeoutError(command));
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      const stdout = Buffer.concat(stdoutChunks).toString('utf8');
      const stderr = Buffer.concat(stderrChunks).toString('utf8');
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`${command} exited with code ${code ?? 'UNKNOWN'}: ${stderr.slice(0, 500)}`));
    });
  });
}

class SpawnTimeoutError extends Error {
  constructor(command: string) {
    super(`${command} timed out`);
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}
