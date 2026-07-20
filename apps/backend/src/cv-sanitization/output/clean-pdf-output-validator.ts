import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import { lstat, open, stat } from 'fs/promises';
import * as path from 'path';

const PDF_MIME_TYPE = 'application/pdf';
const PDF_MAGIC_BYTES = Buffer.from('%PDF-');
const DEFAULT_MAX_CLEAN_PDF_BYTES = 20 * 1024 * 1024;

export interface CleanPdfOutputArtifact {
  filePath: string;
  sha256: string;
  fileSize: number;
  mimeType: string;
}

export class CleanPdfOutputValidator {
  async validate(
    filePath: string,
    expectedParentDir?: string,
  ): Promise<CleanPdfOutputArtifact> {
    const resolvedFilePath = path.resolve(filePath);
    if (expectedParentDir) {
      assertPathInsideDirectory(resolvedFilePath, expectedParentDir);
    }

    const linkStats = await lstat(resolvedFilePath);
    if (linkStats.isSymbolicLink()) {
      throw new Error('Clean CV output must not be a symbolic link');
    }

    const stats = await stat(resolvedFilePath);
    const maxBytes = getMaxCleanPdfBytes();
    if (!stats.isFile() || stats.size <= 0) {
      throw new Error('Clean CV output is empty');
    }
    if (stats.size > maxBytes) {
      throw new Error('Clean CV output exceeds maximum size');
    }

    const magicBytes = await readMagicBytes(resolvedFilePath, PDF_MAGIC_BYTES.length);
    if (!magicBytes.equals(PDF_MAGIC_BYTES)) {
      throw new Error('Clean CV output is not a PDF');
    }

    return {
      filePath: resolvedFilePath,
      sha256: await calculateSha256(resolvedFilePath),
      fileSize: stats.size,
      mimeType: PDF_MIME_TYPE,
    };
  }
}

function getMaxCleanPdfBytes() {
  const parsed = Number(process.env.CV_SANITIZER_MAX_OUTPUT_BYTES);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return DEFAULT_MAX_CLEAN_PDF_BYTES;
}

async function readMagicBytes(filePath: string, byteCount: number) {
  const fileHandle = await open(filePath, 'r');

  try {
    const buffer = Buffer.alloc(byteCount);
    const { bytesRead } = await fileHandle.read(buffer, 0, byteCount, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await fileHandle.close();
  }
}

function calculateSha256(filePath: string) {
  return new Promise<string>((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);

    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function assertPathInsideDirectory(filePath: string, directoryPath: string) {
  const resolvedDirectoryPath = path.resolve(directoryPath);
  if (
    normalizeForComparison(filePath) === normalizeForComparison(resolvedDirectoryPath) ||
    !isPathWithinDirectory(filePath, resolvedDirectoryPath)
  ) {
    throw new Error('Clean CV output is outside expected directory');
  }
}

function isPathWithinDirectory(filePath: string, directoryPath: string) {
  const normalizedFilePath = normalizeForComparison(path.resolve(filePath));
  const normalizedDirectoryPath = normalizeForComparison(path.resolve(directoryPath));
  return normalizedFilePath.startsWith(`${normalizedDirectoryPath}${path.sep}`);
}

function normalizeForComparison(value: string) {
  return process.platform === 'win32' ? value.toLowerCase() : value;
}
