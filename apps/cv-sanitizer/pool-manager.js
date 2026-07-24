'use strict';

const crypto = require('crypto');
const fsp = require('fs/promises');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const WORKER_LABEL = 'vcs.component=cv-sanitizer-worker';
const INPUT_PATH = '/input/input.pdf';
const OUTPUT_PATH = '/output/output.pdf';
const READY_PATH = '/control/ready.json';
const JOB_PATH = '/control/job.json';
const RESULT_PATH = '/control/result.json';
const PDF_MIME_TYPE = 'application/pdf';
const JSON_BODY_LIMIT_BYTES = 64 * 1024;

const workers = [];
let reconciling = false;
let shuttingDown = false;

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function config(name, fallback) {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

function configInt(name, fallback) {
  const value = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function configBool(name, fallback) {
  const value = String(process.env[name] || '').trim().toLowerCase();

  if (['1', 'true', 'yes', 'on'].includes(value)) return true;
  if (['0', 'false', 'no', 'off'].includes(value)) return false;
  return fallback;
}

const settings = {
  port: configInt('PORT', 8080),
  controlRoot: config('CV_SANITIZER_CONTROL_DIR', '/control-root'),
  quarantineRoot: path.resolve(config('CV_QUARANTINE_DIR', '/app/apps/backend/storage/cv-quarantine')),
  safeRoot: path.resolve(config('CV_SAFE_DIR', '/app/apps/backend/storage/cv-safe')),
  workerImage: config('CV_SANITIZER_WORKER_IMAGE', 'vcs-cv-sanitizer-worker:latest'),
  workerBuildContext: config('CV_SANITIZER_WORKER_BUILD_CONTEXT', '/worker-src'),
  workerBuildOnStart: configBool('CV_SANITIZER_WORKER_BUILD_ON_START', false),
  minReady: configInt('CV_SANITIZER_POOL_MIN_READY', 1),
  maxWorkers: configInt('CV_SANITIZER_POOL_MAX_WORKERS', 2),
  readyTimeoutMs: configInt('CV_SANITIZER_READY_TIMEOUT_MS', 30000),
  jobTimeoutMs: configInt('CV_SANITIZER_JOB_TIMEOUT_MS', 60000),
  reconcileIntervalMs: configInt('CV_SANITIZER_RECONCILE_INTERVAL_MS', 1000),
  maxUploadBytes: configInt('MAX_UPLOAD_BYTES', 20971520),
  maxOutputBytes: configInt('CV_SANITIZER_MAX_OUTPUT_BYTES', 20971520),
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomId(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd || undefined,
      stdio: [options.input ? 'pipe' : 'ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timeoutMs = options.timeoutMs || 0;
    const timer = timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true;
          child.kill('SIGKILL');
        }, timeoutMs)
      : null;

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    if (options.input) {
      child.stdin.end(options.input);
    }
    child.on('error', (error) => {
      if (timer) clearTimeout(timer);
      resolve({ exitCode: 1, stdout, stderr: error.message, timedOut });
    });
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      resolve({ exitCode: timedOut ? 124 : Number(code || 0), stdout, stderr, timedOut });
    });
  });
}

async function docker(args, options = {}) {
  const result = await runCommand('docker', args, options);

  if (result.exitCode !== 0 && !options.allowFailure) {
    throw new Error(`docker ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  }

  return result;
}

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true, mode: 0o700 });
}

async function removeDir(dir) {
  await fsp.rm(dir, { recursive: true, force: true });
}

function safeContainerName(workerId) {
  return workerId.replace(/[^A-Za-z0-9_.-]/g, '-').slice(0, 120);
}

function looksLikePdfBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 5) return false;

  let offset = 0;
  const header = buffer.subarray(0, Math.min(buffer.length, 1024));

  if (header.length >= 3 && header[0] === 0xef && header[1] === 0xbb && header[2] === 0xbf) {
    offset = 3;
  }

  while (offset < header.length && [0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20].includes(header[offset])) {
    offset += 1;
  }

  return header.subarray(offset, offset + 5).toString('ascii') === '%PDF-';
}

function responseJson(res, status, payload, headers = {}) {
  const body = Buffer.from(`${JSON.stringify(payload)}\n`, 'utf8');
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': String(body.length),
    ...headers,
  });
  res.end(body);
}

function parseBoundary(contentType) {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  return match ? (match[1] || match[2] || '').trim() : '';
}

async function readRequestBody(req, maxBytes) {
  const chunks = [];
  let total = 0;

  for await (const chunk of req) {
    total += chunk.length;

    if (total > maxBytes) {
      throw new HttpError(413, 'file_too_large', 'CV file is too large.');
    }

    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

function parseMultipartCv(req, body) {
  const boundary = parseBoundary(req.headers['content-type']);

  if (!boundary) {
    throw new HttpError(400, 'missing_boundary', 'Multipart boundary is required.');
  }

  const raw = body.toString('binary');
  const parts = raw.split(`--${boundary}`);

  for (const part of parts) {
    if (!part.includes('name="cv"')) continue;

    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd < 0) continue;

    let content = part.slice(headerEnd + 4);
    if (content.endsWith('\r\n')) {
      content = content.slice(0, -2);
    }

    const file = Buffer.from(content, 'binary');

    if (file.length < 1) {
      throw new HttpError(400, 'empty_file', 'CV file is empty.');
    }
    if (file.length > settings.maxUploadBytes) {
      throw new HttpError(413, 'file_too_large', 'CV file is too large.');
    }

    return file;
  }

  throw new HttpError(400, 'missing_file', 'CV file is required.');
}

function parseJsonPayload(body) {
  try {
    return JSON.parse(body.toString('utf8') || '{}');
  } catch {
    throw new HttpError(400, 'invalid_json', 'Invalid JSON body.');
  }
}

async function buildWorkerImageIfNeeded() {
  const inspect = await docker(['image', 'inspect', settings.workerImage], { allowFailure: true });

  if (inspect.exitCode === 0 && !settings.workerBuildOnStart) {
    return;
  }

  await docker(
    ['build', '--target', 'worker', '-t', settings.workerImage, settings.workerBuildContext],
    { timeoutMs: 180000 },
  );
}

async function cleanupOrphanContainers() {
  const result = await docker(
    ['ps', '-aq', '--filter', `label=${WORKER_LABEL}`],
    { allowFailure: true },
  );
  const ids = result.stdout.split(/\s+/).map((id) => id.trim()).filter(Boolean);

  for (const id of ids) {
    await docker(['rm', '-f', id], { allowFailure: true });
  }
}

async function cleanupControlRoot() {
  await ensureDir(settings.controlRoot);
  const entries = await fsp.readdir(settings.controlRoot, { withFileTypes: true });

  for (const entry of entries) {
    await removeDir(path.join(settings.controlRoot, entry.name));
  }
}

function readFromContainer(worker, containerPath, allowFailure = false) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', ['exec', worker.containerName, 'cat', containerPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const stdout = [];
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout.push(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => {
      if (allowFailure) {
        resolve({ exitCode: 1, stdout: Buffer.alloc(0), stderr: error.message });
      } else {
        reject(error);
      }
    });
    child.on('close', (code) => {
      const result = {
        exitCode: Number(code || 0),
        stdout: Buffer.concat(stdout),
        stderr,
      };

      if (result.exitCode !== 0 && !allowFailure) {
        reject(new Error(`docker exec cat ${containerPath} failed: ${stderr}`));
        return;
      }

      resolve(result);
    });
  });
}

async function writeBufferToContainer(worker, input, containerPath) {
  const result = await runCommand(
    'docker',
    ['exec', '-i', worker.containerName, 'sh', '-c', `cat > ${containerPath}`],
    { input },
  );

  if (result.exitCode !== 0) {
    throw new Error(`docker exec write ${containerPath} failed: ${result.stderr || result.stdout}`);
  }
}

async function isContainerRunning(worker) {
  const result = await docker(
    ['inspect', '-f', '{{.State.Running}} {{.State.ExitCode}}', worker.containerName],
    { allowFailure: true },
  );

  if (result.exitCode !== 0) return false;
  return result.stdout.trim().startsWith('true');
}

async function waitForReady(worker) {
  const deadline = Date.now() + settings.readyTimeoutMs;

  while (Date.now() < deadline) {
    const ready = await docker(
      ['exec', worker.containerName, 'sh', '-c', `test -f ${READY_PATH}`],
      { allowFailure: true },
    );

    if (ready.exitCode === 0) {
      worker.status = 'READY';
      worker.readyAt = new Date();
      return;
    }

    if (!(await isContainerRunning(worker))) {
      throw new Error('Worker exited before becoming ready.');
    }

    await sleep(100);
  }

  throw new Error('Worker did not become ready before timeout.');
}

async function terminateWorker(worker) {
  worker.status = 'TERMINATING';
  await docker(['rm', '-f', worker.containerName], { allowFailure: true });
  await removeDir(worker.root);
  worker.status = 'TERMINATED';
  const index = workers.indexOf(worker);

  if (index >= 0) {
    workers.splice(index, 1);
  }
}

async function spawnWorker() {
  const workerId = randomId('worker');
  const worker = {
    id: workerId,
    containerName: safeContainerName(`vcs-cv-${workerId}`),
    root: path.join(settings.controlRoot, workerId),
    status: 'STARTING',
    createdAt: new Date(),
  };

  workers.push(worker);
  await ensureDir(worker.root);

  const args = [
    'run',
    '-d',
    '--name',
    worker.containerName,
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
    '--tmpfs',
    '/input:rw,noexec,nosuid,size=32m,mode=1777',
    '--tmpfs',
    '/output:rw,noexec,nosuid,size=32m,mode=1777',
    '--tmpfs',
    '/control:rw,noexec,nosuid,size=4m,mode=1777',
    '--label',
    WORKER_LABEL,
    '--label',
    `vcs.worker-id=${worker.id}`,
    '-e',
    `CV_SANITIZER_JOB_TIMEOUT_MS=${settings.jobTimeoutMs}`,
    settings.workerImage,
  ];

  const result = await docker(args);
  worker.containerId = result.stdout.trim();

  try {
    await waitForReady(worker);
    return worker;
  } catch (error) {
    await terminateWorker(worker);
    throw error;
  }
}

function capacityWorkers() {
  return workers.filter((worker) => ['STARTING', 'READY', 'RESERVED', 'PROCESSING'].includes(worker.status));
}

async function reconcilePool() {
  if (reconciling || shuttingDown) return;
  reconciling = true;

  try {
    while (
      workers.filter((worker) => worker.status === 'READY' || worker.status === 'STARTING').length < settings.minReady
      && capacityWorkers().length < settings.maxWorkers
    ) {
      spawnWorker().catch((error) => {
        console.error(`Failed to spawn disposable CV worker: ${error.message}`);
      });
      break;
    }
  } finally {
    reconciling = false;
  }
}

async function reserveReadyWorker() {
  const deadline = Date.now() + settings.readyTimeoutMs;

  while (Date.now() < deadline) {
    const ready = workers.find((worker) => worker.status === 'READY');

    if (ready) {
      ready.status = 'RESERVED';
      ready.reservedAt = new Date();
      return ready;
    }

    if (capacityWorkers().length < settings.maxWorkers) {
      const worker = await spawnWorker();
      worker.status = 'RESERVED';
      worker.reservedAt = new Date();
      return worker;
    }

    await sleep(100);
  }

  throw new HttpError(503, 'pool_busy', 'CV sanitizer pool is busy.');
}

async function waitForResult(worker) {
  const deadline = Date.now() + settings.jobTimeoutMs + 5000;

  while (Date.now() < deadline) {
    const copied = await readFromContainer(worker, RESULT_PATH, true);

    if (copied.exitCode === 0) {
      return JSON.parse(copied.stdout.toString('utf8'));
    }

    if (!(await isContainerRunning(worker))) {
      const retry = await readFromContainer(worker, RESULT_PATH, true);

      if (retry.exitCode === 0) {
        return JSON.parse(retry.stdout.toString('utf8'));
      }

      const logs = await docker(['logs', worker.containerName], { allowFailure: true });
      const detail = `${logs.stdout || ''}${logs.stderr || ''}`.trim().slice(-1000);

      throw new HttpError(
        503,
        'worker_crashed',
        detail ? `Disposable CV worker exited without a result: ${detail}` : 'Disposable CV worker exited without a result.',
      );
    }

    await sleep(100);
  }

  throw new HttpError(503, 'job_timeout', 'CV sanitization timed out.');
}

async function sanitizeWithWorker(worker, input) {
  worker.status = 'PROCESSING';
  worker.startedAt = new Date();

  const job = Buffer.from(
    `${JSON.stringify({
      job_id: randomId('job'),
      input_path: INPUT_PATH,
      output_path: OUTPUT_PATH,
      timeout_ms: settings.jobTimeoutMs,
    })}\n`,
    'utf8',
  );

  await writeBufferToContainer(worker, input, INPUT_PATH);
  await writeBufferToContainer(worker, job, JOB_PATH);

  const result = await waitForResult(worker);

  if (result.timed_out || result.exit_code !== 0 || result.status !== 'SUCCEEDED') {
    throw new HttpError(503, 'ghostscript_failed', result.stderr || 'Ghostscript sanitization failed.');
  }

  const outputProbe = await docker(
    ['exec', worker.containerName, 'sh', '-c', `test -f ${OUTPUT_PATH} && test ! -L ${OUTPUT_PATH}`],
    { allowFailure: true },
  );

  if (outputProbe.exitCode !== 0) {
    throw new HttpError(503, 'invalid_output', 'Sanitizer produced an invalid output file.');
  }

  const outputRead = await readFromContainer(worker, OUTPUT_PATH);
  const output = outputRead.stdout;

  if (output.length < 1 || output.length > settings.maxOutputBytes) {
    throw new HttpError(503, 'invalid_output_size', 'Sanitizer output size is invalid.');
  }

  if (!looksLikePdfBuffer(output)) {
    throw new HttpError(503, 'invalid_output_pdf', 'Sanitizer output is not a PDF.');
  }

  return {
    output,
    hash: crypto.createHash('sha256').update(output).digest('hex'),
  };
}

async function sanitizePdfBuffer(input) {
  if (!looksLikePdfBuffer(input)) {
    throw new HttpError(415, 'unsupported_type', 'Only PDF CV files are allowed.');
  }

  let worker = null;

  try {
    worker = await reserveReadyWorker();
    const clean = await sanitizeWithWorker(worker, input);
    return {
      ...clean,
      workerId: worker.id,
    };
  } finally {
    if (worker) {
      try {
        await terminateWorker(worker);
      } catch (error) {
        console.error(`Failed to terminate disposable CV worker ${worker.id}: ${error.message}`);
      }
    }

    reconcilePool().catch((error) => {
      console.error(`Failed to replenish disposable pool: ${error.message}`);
    });
  }
}

async function handleMultipartSanitize(req, res) {
  const body = await readRequestBody(req, settings.maxUploadBytes + 1048576);
  const input = parseMultipartCv(req, body);

  try {
    const clean = await sanitizePdfBuffer(input);

    res.writeHead(200, {
      'Content-Type': PDF_MIME_TYPE,
      'Content-Length': String(clean.output.length),
      'X-CV-Sanitizer': 'disposable-pool',
      'X-CV-Sanitizer-Worker-ID': clean.workerId,
      'X-CV-Sanitizer-Output-Sha256': clean.hash,
    });
    res.end(clean.output);
  } catch (error) {
    respondMultipartError(res, error);
  }
}

async function handleJsonSanitize(req, res) {
  const startedAt = Date.now();
  const body = await readRequestBody(req, JSON_BODY_LIMIT_BYTES);
  const payload = parseJsonPayload(body);
  const sourceMimeType = requireText(payload.sourceMimeType, 'sourceMimeType');

  if (sourceMimeType !== PDF_MIME_TYPE) {
    responseJson(res, 200, failedJson(startedAt, 'UNSUPPORTED_SANITIZER_INPUT'));
    return;
  }

  const sourcePath = resolveSanitizerPath({
    storagePath: optionalText(payload.sourceStoragePath),
    filePath: optionalText(payload.sourceFilePath),
    root: settings.quarantineRoot,
    storagePrefix: 'quarantine',
    missingReasonCode: 'MISSING_SOURCE_PATH',
    invalidReasonCode: 'SOURCE_PATH_NOT_ALLOWED',
  });
  const outputPath = resolveSanitizerPath({
    storagePath: optionalText(payload.outputStoragePath),
    filePath: optionalText(payload.outputFilePath),
    root: settings.safeRoot,
    storagePrefix: 'safe',
    missingReasonCode: 'MISSING_OUTPUT_PATH',
    invalidReasonCode: 'OUTPUT_PATH_NOT_ALLOWED',
  });

  try {
    const input = await fsp.readFile(sourcePath);
    const clean = await sanitizePdfBuffer(input);

    await ensureDir(path.dirname(outputPath));
    await fsp.writeFile(outputPath, clean.output, { mode: 0o600 });

    responseJson(res, 200, {
      status: 'SANITIZED',
      sanitizer: 'ghostscript-disposable-pool-http-sanitizer',
      sanitizedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      outputFilePath: outputPath,
      outputStoragePath: optionalText(payload.outputStoragePath),
      outputMimeType: PDF_MIME_TYPE,
      outputSha256: clean.hash,
      reasonCode: null,
    }, {
      'X-CV-Sanitizer': 'disposable-pool',
      'X-CV-Sanitizer-Worker-ID': clean.workerId,
      'X-CV-Sanitizer-Output-Sha256': clean.hash,
    });
  } catch (error) {
    respondJsonSanitizeError(res, startedAt, error);
  }
}

function respondMultipartError(res, error) {
  const status = error instanceof HttpError ? error.status : 500;
  const code = error instanceof HttpError ? error.code : 'pool_manager_error';
  const message = error && error.message ? error.message : 'CV sanitizer pool failed.';

  responseJson(
    res,
    status,
    {
      code,
      message,
    },
    {
      'X-CV-Sanitizer': 'disposable-pool',
    },
  );
}

function respondJsonSanitizeError(res, startedAt, error) {
  const status = error instanceof HttpError ? error.status : 503;
  const reasonCode = error instanceof HttpError
    ? error.code.toUpperCase()
    : 'SANITIZER_SERVICE_FAILED';

  responseJson(res, status, failedJson(startedAt, reasonCode), {
    'X-CV-Sanitizer': 'disposable-pool',
  });
}

function failedJson(startedAt, reasonCode) {
  return {
    status: 'FAILED',
    sanitizer: 'ghostscript-disposable-pool-http-sanitizer',
    sanitizedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    outputFilePath: null,
    outputStoragePath: null,
    outputMimeType: null,
    reasonCode,
  };
}

function requireText(value, fieldName) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new HttpError(400, `missing_${fieldName.toLowerCase()}`, `${fieldName} is required.`);
  }

  return value.trim();
}

function optionalText(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function resolveSanitizerPath({
  storagePath,
  filePath,
  root,
  storagePrefix,
  missingReasonCode,
  invalidReasonCode,
}) {
  if (storagePath) {
    return resolveStoragePath(storagePath, root, storagePrefix, invalidReasonCode);
  }

  if (filePath) {
    return assertWithinRoot(filePath, root, invalidReasonCode);
  }

  throw new HttpError(400, missingReasonCode.toLowerCase(), missingReasonCode);
}

function resolveStoragePath(storagePath, root, storagePrefix, reasonCode) {
  const prefix = `${storagePrefix}/`;
  if (!storagePath.startsWith(prefix)) {
    throw new HttpError(400, reasonCode.toLowerCase(), reasonCode);
  }

  const relativePath = storagePath.slice(prefix.length);
  if (!isSafeRelativeStoragePath(relativePath)) {
    throw new HttpError(400, reasonCode.toLowerCase(), reasonCode);
  }

  return assertWithinRoot(path.resolve(root, relativePath), root, reasonCode);
}

function assertWithinRoot(filePath, root, reasonCode) {
  const resolved = path.resolve(filePath);
  const normalizedRoot = normalizeForComparison(root);
  const normalizedFilePath = normalizeForComparison(resolved);

  if (
    normalizedFilePath === normalizedRoot
    || !normalizedFilePath.startsWith(`${normalizedRoot}${path.sep}`)
  ) {
    throw new HttpError(400, reasonCode.toLowerCase(), reasonCode);
  }

  return resolved;
}

function isSafeRelativeStoragePath(value) {
  if (!value || value.includes('\0') || path.isAbsolute(value)) return false;

  return value.split('/').every((segment) => (
    Boolean(segment)
    && segment !== '.'
    && segment !== '..'
    && !segment.includes('\\')
  ));
}

function normalizeForComparison(value) {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function poolCounts() {
  return workers.reduce(
    (counts, worker) => {
      counts[worker.status] = (counts[worker.status] || 0) + 1;
      return counts;
    },
    {},
  );
}

async function handleRequest(req, res) {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    responseJson(res, 200, {
      status: 'ok',
      mode: 'DISPOSABLE_POOL',
      workers: poolCounts(),
      min_ready: settings.minReady,
      max_workers: settings.maxWorkers,
      worker_image: settings.workerImage,
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/sanitize') {
    const contentType = String(req.headers['content-type'] || '').toLowerCase();

    if (contentType.includes('multipart/form-data')) {
      await handleMultipartSanitize(req, res);
      return;
    }

    if (contentType.includes('application/json')) {
      await handleJsonSanitize(req, res);
      return;
    }

    throw new HttpError(415, 'unsupported_content_type', 'Use application/json or multipart/form-data.');
  }

  responseJson(res, 404, {
    code: 'not_found',
    message: 'Endpoint not found.',
  });
}

async function shutdown() {
  shuttingDown = true;
  await Promise.allSettled(workers.slice().map((worker) => terminateWorker(worker)));
  process.exit(0);
}

async function main() {
  await ensureDir(settings.controlRoot);
  await cleanupOrphanContainers();
  await cleanupControlRoot();
  await buildWorkerImageIfNeeded();
  await reconcilePool();
  setInterval(() => {
    reconcilePool().catch((error) => {
      console.error(`Pool reconcile failed: ${error.message}`);
    });
  }, settings.reconcileIntervalMs);

  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((error) => {
      const status = error instanceof HttpError ? error.status : 500;
      const code = error instanceof HttpError ? error.code : 'pool_manager_error';
      const message = error && error.message ? error.message : 'CV sanitizer pool failed.';
      responseJson(res, status, {
        code,
        message,
      });
    });
  });

  server.listen(settings.port, '0.0.0.0', () => {
    console.log(`CV sanitizer disposable pool listening on ${settings.port}`);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
