const { spawn } = require('child_process');
const fs = require('fs/promises');
const path = require('path');

const CONTROL_DIR = '/control';
const INPUT_DIR = '/input';
const OUTPUT_DIR = '/output';
const READY_FILE = path.join(CONTROL_DIR, 'ready.json');
const JOB_FILE = path.join(CONTROL_DIR, 'job.json');
const RESULT_FILE = path.join(CONTROL_DIR, 'result.json');

main().catch(async (error) => {
  await writeResult({
    status: 'FAILED',
    reasonCode: 'WORKER_CRASHED',
    errorMessageSafe: error instanceof Error ? error.message.slice(0, 300) : 'Worker crashed.',
    exitCode: null,
  });
  process.exit(1);
});

async function main() {
  await fs.writeFile(READY_FILE, `${JSON.stringify({ readyAt: new Date().toISOString() })}\n`, 'utf8');
  const descriptor = await waitForJobDescriptor();
  const startedAt = Date.now();
  const inputFileName = requireRelativeFileName(descriptor.inputFileName, 'inputFileName');
  const outputFileName = requireRelativeFileName(descriptor.outputFileName, 'outputFileName');
  const inputFilePath = path.join(INPUT_DIR, inputFileName);
  const outputFilePath = path.join(OUTPUT_DIR, outputFileName);

  const exitCode = await runGhostscript(inputFilePath, outputFilePath);
  if (exitCode === 0) {
    await writeResult({
      status: 'SANITIZED',
      outputFileName,
      exitCode,
      reasonCode: null,
      errorMessageSafe: null,
      durationMs: Date.now() - startedAt,
    });
    return;
  }

  await writeResult({
    status: 'FAILED',
    outputFileName: null,
    exitCode,
    reasonCode: exitCode === null ? 'GHOSTSCRIPT_TRANSIENT_FAILURE' : 'GHOSTSCRIPT_SANITIZE_FAILED',
    errorMessageSafe: 'Ghostscript failed to sanitize the PDF.',
    durationMs: Date.now() - startedAt,
  });
  process.exit(exitCode || 1);
}

async function waitForJobDescriptor() {
  for (;;) {
    try {
      const raw = await fs.readFile(JOB_FILE, 'utf8');
      return JSON.parse(raw);
    } catch (error) {
      if (error && error.code !== 'ENOENT') throw error;
      await sleep(250);
    }
  }
}

function requireRelativeFileName(value, fieldName) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${fieldName} is required`);
  }
  if (value.includes('/') || value.includes('\\') || value === '.' || value === '..' || path.isAbsolute(value)) {
    throw new Error(`${fieldName} must be a relative file name`);
  }
  return value;
}

function runGhostscript(inputFilePath, outputFilePath) {
  const args = [
    '-dSAFER',
    '-dBATCH',
    '-dNOPAUSE',
    '-sDEVICE=pdfwrite',
    '-dCompatibilityLevel=1.7',
    '-dPDFSETTINGS=/printer',
    '-dDetectDuplicateImages=true',
    '-dCompressFonts=true',
    `-sOutputFile=${outputFilePath}`,
    inputFilePath,
  ];

  return new Promise((resolve) => {
    const child = spawn('gs', args, {
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    child.on('error', () => resolve(null));
    child.on('close', (code) => resolve(code));
  });
}

async function writeResult(result) {
  await fs.writeFile(RESULT_FILE, `${JSON.stringify(result)}\n`, 'utf8').catch(() => undefined);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
