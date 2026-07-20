import * as path from 'path';

export interface CvSanitizerPoolConfig {
  poolEnabled: boolean;
  poolManagerEnabled: boolean;
  minReadyWorkers: number;
  maxWorkers: number;
  jobTimeoutMs: number;
  maxAttempts: number;
  readyTimeoutMs: number;
  reconcileIntervalMs: number;
  workerImage: string;
  controlDir: string;
  jobWaitTimeoutMs: number;
  version: string;
  dockerCommand: string;
}

export function getCvSanitizerPoolConfig(): CvSanitizerPoolConfig {
  const minReadyWorkers = parseIntegerEnv('CV_SANITIZER_POOL_MIN_READY', 1);
  const maxWorkers = parseIntegerEnv('CV_SANITIZER_POOL_MAX_WORKERS', 2);
  const jobTimeoutMs = parseIntegerEnv('CV_SANITIZER_JOB_TIMEOUT_MS', 60_000);
  const maxAttempts = parseIntegerEnv('CV_SANITIZER_MAX_ATTEMPTS', 2);
  const readyTimeoutMs = parseIntegerEnv('CV_SANITIZER_READY_TIMEOUT_MS', 30_000);
  const reconcileIntervalMs = parseIntegerEnv('CV_SANITIZER_RECONCILE_INTERVAL_MS', 1_000);
  const jobWaitTimeoutMs = parseIntegerEnv('CV_SANITIZER_JOB_WAIT_TIMEOUT_MS', 90_000);
  const workerImage = readTextEnv('CV_SANITIZER_WORKER_IMAGE', 'auto-cv-processing-cv-sanitizer-worker:latest');
  const controlDir = path.resolve(readTextEnv('CV_SANITIZER_CONTROL_DIR', './storage/cv-sanitizer-control'));

  assertNumber('CV_SANITIZER_POOL_MIN_READY', minReadyWorkers, 0);
  assertNumber('CV_SANITIZER_POOL_MAX_WORKERS', maxWorkers, 1);
  if (minReadyWorkers > maxWorkers) {
    throw new Error('CV_SANITIZER_POOL_MIN_READY must be less than or equal to CV_SANITIZER_POOL_MAX_WORKERS');
  }
  assertNumber('CV_SANITIZER_JOB_TIMEOUT_MS', jobTimeoutMs, 1);
  assertNumber('CV_SANITIZER_MAX_ATTEMPTS', maxAttempts, 1);
  assertNumber('CV_SANITIZER_READY_TIMEOUT_MS', readyTimeoutMs, 1);
  assertNumber('CV_SANITIZER_RECONCILE_INTERVAL_MS', reconcileIntervalMs, 1);
  assertNumber('CV_SANITIZER_JOB_WAIT_TIMEOUT_MS', jobWaitTimeoutMs, 1);

  return {
    poolEnabled: parseBooleanEnv('CV_SANITIZER_POOL_ENABLED', false),
    poolManagerEnabled: parseBooleanEnv('CV_SANITIZER_POOL_MANAGER', false),
    minReadyWorkers,
    maxWorkers,
    jobTimeoutMs,
    maxAttempts,
    readyTimeoutMs,
    reconcileIntervalMs,
    workerImage,
    controlDir,
    jobWaitTimeoutMs,
    version: readTextEnv('CV_SANITIZER_VERSION', 'local'),
    dockerCommand: readTextEnv('CV_SANITIZER_DOCKER_COMMAND', 'docker'),
  };
}

function parseIntegerEnv(name: string, defaultValue: number) {
  const rawValue = process.env[name]?.trim();
  if (!rawValue) return defaultValue;

  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${name} must be an integer`);
  }
  return parsed;
}

function parseBooleanEnv(name: string, defaultValue: boolean) {
  const rawValue = process.env[name]?.trim().toLowerCase();
  if (!rawValue) return defaultValue;
  if (['1', 'true', 'yes', 'on'].includes(rawValue)) return true;
  if (['0', 'false', 'no', 'off'].includes(rawValue)) return false;
  throw new Error(`${name} must be a boolean`);
}

function readTextEnv(name: string, defaultValue: string) {
  return process.env[name]?.trim() || defaultValue;
}

function assertNumber(name: string, value: number, min: number) {
  if (!Number.isFinite(value) || value < min) {
    throw new Error(`${name} must be greater than or equal to ${min}`);
  }
}
