'use strict';

const fs = require('fs/promises');
const { spawn } = require('child_process');

const CONTROL_DIR = '/control';
const INPUT_PATH = '/input/input.pdf';
const OUTPUT_PATH = '/output/output.pdf';
const READY_PATH = `${CONTROL_DIR}/ready.json`;
const JOB_PATH = `${CONTROL_DIR}/job.json`;
const RESULT_PATH = `${CONTROL_DIR}/result.json`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function configInt(name, fallback) {
  const value = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

async function writeJson(filePath, payload) {
  await fs.writeFile(filePath, `${JSON.stringify(payload)}\n`, { mode: 0o644 });
}

async function readJob() {
  while (true) {
    try {
      const raw = await fs.readFile(JOB_PATH, 'utf8');
      return JSON.parse(raw);
    } catch (error) {
      if (error && error.code !== 'ENOENT') {
        throw error;
      }

      await sleep(100);
    }
  }
}

function validateJob(job) {
  if (!job || job.input_path !== INPUT_PATH || job.output_path !== OUTPUT_PATH) {
    throw new Error('Invalid sanitizer job paths.');
  }
}

function runGhostscript(timeoutMs) {
  return new Promise((resolve) => {
    const args = [
      '-dSAFER',
      '-dBATCH',
      '-dNOPAUSE',
      '-sDEVICE=pdfwrite',
      '-dCompatibilityLevel=1.7',
      '-dPDFSETTINGS=/printer',
      '-dDetectDuplicateImages=true',
      '-dCompressFonts=true',
      `-sOutputFile=${OUTPUT_PATH}`,
      INPUT_PATH,
    ];

    const child = spawn('gs', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({
        exit_code: 1,
        timed_out: false,
        stdout,
        stderr: error.message,
      });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        exit_code: timedOut ? 124 : Number(code || 0),
        timed_out: timedOut,
        stdout,
        stderr,
      });
    });
  });
}

async function waitForManagerRead() {
  const deadline = Date.now() + configInt('CV_SANITIZER_RESULT_GRACE_MS', 30000);

  while (Date.now() < deadline) {
    await sleep(250);
  }
}

async function main() {
  await writeJson(READY_PATH, {
    status: 'READY',
    pid: process.pid,
    ready_at: new Date().toISOString(),
  });

  const job = await readJob();
  validateJob(job);

  const timeoutMs = Number.isFinite(Number(job.timeout_ms)) && Number(job.timeout_ms) > 0
    ? Number(job.timeout_ms)
    : configInt('CV_SANITIZER_JOB_TIMEOUT_MS', 60000);
  const result = await runGhostscript(timeoutMs);

  await writeJson(RESULT_PATH, {
    status: result.exit_code === 0 && !result.timed_out ? 'SUCCEEDED' : 'FAILED',
    exit_code: result.exit_code,
    timed_out: result.timed_out,
    stdout: result.stdout.slice(-4000),
    stderr: result.stderr.slice(-4000),
    finished_at: new Date().toISOString(),
  });

  await waitForManagerRead();
  process.exit(result.exit_code === 0 && !result.timed_out ? 0 : 1);
}

main().catch(async (error) => {
  try {
    await writeJson(RESULT_PATH, {
      status: 'FAILED',
      exit_code: 1,
      timed_out: false,
      stdout: '',
      stderr: error && error.message ? error.message : 'Worker failed.',
      finished_at: new Date().toISOString(),
    });
  } catch (_) {
    // The worker is already failing; preserve the original exit path.
  }

  await waitForManagerRead();
  process.exit(1);
});
