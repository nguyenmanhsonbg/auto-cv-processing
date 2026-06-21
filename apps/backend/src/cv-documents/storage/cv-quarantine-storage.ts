import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';
import { unlink } from 'fs/promises';
import * as path from 'path';

export const DEFAULT_CV_QUARANTINE_DIR = './storage/cv-quarantine';
export const CV_QUARANTINE_STORAGE_PREFIX = 'quarantine';

export function getCvQuarantineRoot() {
  const configuredDir = process.env.CV_QUARANTINE_DIR?.trim() || DEFAULT_CV_QUARANTINE_DIR;
  const root = path.resolve(configuredDir);
  assertQuarantineRootIsNotPublicUploads(root);
  return root;
}

export function ensureCvQuarantineRoot() {
  const root = getCvQuarantineRoot();
  mkdirSync(root, { recursive: true });
  return root;
}

export function buildCvQuarantineFileName(originalFileName: string) {
  return `${Date.now()}-${randomUUID()}${path.extname(originalFileName).toLowerCase()}`;
}

export function assertCvQuarantineFilePath(filePath: string) {
  const resolvedFilePath = path.resolve(filePath);
  const quarantineRoot = getCvQuarantineRoot();

  if (
    resolvedFilePath === quarantineRoot ||
    !isPathWithinDirectory(resolvedFilePath, quarantineRoot)
  ) {
    throw new Error('CV file is outside quarantine storage');
  }

  return resolvedFilePath;
}

export function isCvQuarantineFilePath(filePath?: string | null) {
  if (!filePath) return false;

  try {
    assertCvQuarantineFilePath(filePath);
    return true;
  } catch {
    return false;
  }
}

export function toCvQuarantineStorageKey(filePath: string) {
  const resolvedFilePath = assertCvQuarantineFilePath(filePath);
  const relativePath = path.relative(getCvQuarantineRoot(), resolvedFilePath)
    .replace(/\\/g, '/');

  if (!isSafeRelativeStoragePath(relativePath)) {
    throw new Error('CV quarantine storage key is invalid');
  }

  return `${CV_QUARANTINE_STORAGE_PREFIX}/${relativePath}`;
}

export function resolveCvQuarantineStorageKey(storageKey: string) {
  const normalizedKey = storageKey.trim();
  const prefix = `${CV_QUARANTINE_STORAGE_PREFIX}/`;

  if (!normalizedKey.startsWith(prefix)) {
    throw new Error('CV quarantine storage key is invalid');
  }

  const relativePath = normalizedKey.slice(prefix.length);
  if (!isSafeRelativeStoragePath(relativePath)) {
    throw new Error('CV quarantine storage key is invalid');
  }

  return assertCvQuarantineFilePath(path.resolve(getCvQuarantineRoot(), relativePath));
}

export async function deleteCvQuarantineFile(filePath?: string | null) {
  if (!isCvQuarantineFilePath(filePath)) return;
  await unlink(path.resolve(filePath as string)).catch(() => undefined);
}

function assertQuarantineRootIsNotPublicUploads(quarantineRoot: string) {
  const uploadDir = process.env.UPLOAD_DIR?.trim() || './uploads';
  const publicUploadRoot = path.resolve(uploadDir);

  if (
    isSamePath(quarantineRoot, publicUploadRoot) ||
    isPathWithinDirectory(quarantineRoot, publicUploadRoot)
  ) {
    throw new Error('CV quarantine storage must not be inside public upload storage');
  }
}

function isSafeRelativeStoragePath(value: string) {
  if (!value || value.includes('\0') || path.isAbsolute(value)) return false;

  return value.split('/').every((segment) => (
    Boolean(segment) &&
    segment !== '.' &&
    segment !== '..' &&
    !segment.includes('\\')
  ));
}

function isPathWithinDirectory(filePath: string, directoryPath: string) {
  const normalizedFilePath = normalizeForComparison(path.resolve(filePath));
  const normalizedDirectoryPath = normalizeForComparison(path.resolve(directoryPath));
  return normalizedFilePath.startsWith(`${normalizedDirectoryPath}${path.sep}`);
}

function isSamePath(left: string, right: string) {
  return normalizeForComparison(path.resolve(left)) === normalizeForComparison(path.resolve(right));
}

function normalizeForComparison(value: string) {
  return process.platform === 'win32' ? value.toLowerCase() : value;
}
