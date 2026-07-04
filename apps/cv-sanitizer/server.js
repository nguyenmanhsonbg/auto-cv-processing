const http = require('http');
const { spawn } = require('child_process');
const { mkdir, stat } = require('fs/promises');
const path = require('path');

const PDF_MIME_TYPE = 'application/pdf';
const PORT = Number(process.env.PORT || 8080);
const MAX_BODY_BYTES = 16 * 1024;
const DEFAULT_TIMEOUT_MS = 60_000;

const quarantineRoot = resolveRoot(
  process.env.CV_QUARANTINE_DIR,
  '/app/apps/backend/storage/cv-quarantine',
);
const safeRoot = resolveRoot(
  process.env.CV_SAFE_DIR,
  '/app/apps/backend/storage/cv-safe',
);

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') {
      await writeJson(res, 200, { status: 'ok' });
      return;
    }

    if (req.method === 'POST' && req.url === '/sanitize') {
      const payload = await readJsonBody(req);
      const result = await sanitizePdf(payload);
      await writeJson(res, 200, result);
      return;
    }

    await writeJson(res, 404, { status: 'FAILED', reasonCode: 'NOT_FOUND' });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    await writeJson(res, statusCode, {
      status: 'FAILED',
      reasonCode: error.reasonCode || 'SANITIZER_INTERNAL_ERROR',
    });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`cv-sanitizer listening on ${PORT}`);
});

async function sanitizePdf(payload) {
  const startedAt = Date.now();
  const sourceMimeType = requireText(payload.sourceMimeType, 'sourceMimeType');
  const sourceFilePath = requireText(payload.sourceFilePath, 'sourceFilePath');
  const outputFilePath = requireText(payload.outputFilePath, 'outputFilePath');

  if (sourceMimeType !== PDF_MIME_TYPE) {
    return failed(startedAt, 'UNSUPPORTED_SANITIZER_INPUT');
  }

  const sourcePath = assertWithinRoot(sourceFilePath, quarantineRoot, 'SOURCE_PATH_NOT_ALLOWED');
  const outputPath = assertWithinRoot(outputFilePath, safeRoot, 'OUTPUT_PATH_NOT_ALLOWED');

  await stat(sourcePath);
  await mkdir(path.dirname(outputPath), { recursive: true });

  await runGhostscript(sourcePath, outputPath, getTimeoutMs());

  return {
    status: 'SANITIZED',
    sanitizer: 'ghostscript-http-pdf-sanitizer-service',
    sanitizedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    outputFilePath: outputPath,
    outputMimeType: PDF_MIME_TYPE,
    reasonCode: null,
  };
}

function runGhostscript(sourcePath, outputPath, timeoutMs) {
  const args = [
    '-dSAFER',
    '-dBATCH',
    '-dNOPAUSE',
    '-sDEVICE=pdfwrite',
    '-dCompatibilityLevel=1.7',
    '-dPDFSETTINGS=/printer',
    '-dDetectDuplicateImages=true',
    '-dCompressFonts=true',
    `-sOutputFile=${outputPath}`,
    sourcePath,
  ];

  return new Promise((resolve, reject) => {
    const child = spawn('gs', args, {
      stdio: ['ignore', 'ignore', 'ignore'],
      windowsHide: true,
    });
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(toError('GHOSTSCRIPT_TIMEOUT'));
    }, timeoutMs);

    child.on('error', () => {
      clearTimeout(timeout);
      reject(toError('GHOSTSCRIPT_SPAWN_FAILED'));
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve();
        return;
      }
      reject(toError('GHOSTSCRIPT_SANITIZE_FAILED'));
    });
  });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
        reject(toError('REQUEST_TOO_LARGE', 413));
        req.destroy();
      }
    });

    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch {
        reject(toError('INVALID_JSON', 400));
      }
    });

    req.on('error', () => reject(toError('REQUEST_READ_FAILED', 400)));
  });
}

async function writeJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function failed(startedAt, reasonCode) {
  return {
    status: 'FAILED',
    sanitizer: 'ghostscript-http-pdf-sanitizer-service',
    sanitizedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    outputFilePath: null,
    outputMimeType: null,
    reasonCode,
  };
}

function requireText(value, fieldName) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw toError(`MISSING_${fieldName.toUpperCase()}`, 400);
  }
  return value.trim();
}

function resolveRoot(value, fallback) {
  return path.resolve((value && value.trim()) || fallback);
}

function assertWithinRoot(filePath, root, reasonCode) {
  const resolved = path.resolve(filePath);
  const normalizedRoot = normalizeForComparison(root);
  const normalizedFilePath = normalizeForComparison(resolved);

  if (
    normalizedFilePath === normalizedRoot ||
    !normalizedFilePath.startsWith(`${normalizedRoot}${path.sep}`)
  ) {
    throw toError(reasonCode, 400);
  }

  return resolved;
}

function normalizeForComparison(value) {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function getTimeoutMs() {
  const parsed = Number(process.env.CV_GHOSTSCRIPT_TIMEOUT_MS);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.min(parsed, 300_000);
  }
  return DEFAULT_TIMEOUT_MS;
}

function toError(reasonCode, statusCode = 500) {
  const error = new Error(reasonCode);
  error.reasonCode = reasonCode;
  error.statusCode = statusCode;
  return error;
}
