import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';
import { unlink } from 'fs/promises';
import * as path from 'path';
import { getCvQuarantineRoot } from '../../cv-documents/storage/cv-quarantine-storage';

export const DEFAULT_CV_SAFE_DIR = './storage/cv-safe';
export const CV_SAFE_STORAGE_PREFIX = 'safe';

export function getCvSafeRoot() {
  const configuredDir = process.env.CV_SAFE_DIR?.trim() || DEFAULT_CV_SAFE_DIR;
  const root = path.resolve(configuredDir);
  assertSafeRootIsIsolated(root);
  return root;
}

export function ensureCvSafeRoot() {
  const root = getCvSafeRoot();
  mkdirSync(root, { recursive: true });
  return root;
}

export function buildCvSafePdfFileName() {
  return `${Date.now()}-${randomUUID()}.pdf`;
}

export function assertCvSafeFilePath(filePath: string) {
  const resolvedFilePath = path.resolve(filePath);
  const safeRoot = getCvSafeRoot();

  if (
    resolvedFilePath === safeRoot ||
    !isPathWithinDirectory(resolvedFilePath, safeRoot)
  ) {
    throw new Error('CV file is outside safe storage');
  }

  return resolvedFilePath;
}

export function toCvSafeStorageKey(filePath: string) {
  const resolvedFilePath = assertCvSafeFilePath(filePath);
  const relativePath = path.relative(getCvSafeRoot(), resolvedFilePath)
    .replace(/\\/g, '/');

  if (!isSafeRelativeStoragePath(relativePath)) {
    throw new Error('CV safe storage key is invalid');
  }

  return `${CV_SAFE_STORAGE_PREFIX}/${relativePath}`;
}

export function resolveCvSafeStorageKey(storageKey: string) {
  const normalizedKey = storageKey.trim();
  const prefix = `${CV_SAFE_STORAGE_PREFIX}/`;

  if (!normalizedKey.startsWith(prefix)) {
    throw new Error('CV safe storage key is invalid');
  }

  const relativePath = normalizedKey.slice(prefix.length);
  if (!isSafeRelativeStoragePath(relativePath)) {
    throw new Error('CV safe storage key is invalid');
  }

  return assertCvSafeFilePath(path.resolve(getCvSafeRoot(), relativePath));
}

export async function deleteCvSafeFile(filePath?: string | null) {
  if (!filePath) return;

  try {
    await unlink(assertCvSafeFilePath(filePath));
  } catch {
    // Best-effort cleanup only; caller owns the primary workflow failure path.
  }
}

function assertSafeRootIsIsolated(safeRoot: string) {
  const uploadDir = process.env.UPLOAD_DIR?.trim() || './uploads';
  const publicUploadRoot = path.resolve(uploadDir);
  const quarantineRoot = getCvQuarantineRoot();

  if (
    isSamePath(safeRoot, publicUploadRoot) ||
    isPathWithinDirectory(safeRoot, publicUploadRoot) ||
    isSamePath(safeRoot, quarantineRoot) ||
    isPathWithinDirectory(safeRoot, quarantineRoot) ||
    isPathWithinDirectory(quarantineRoot, safeRoot)
  ) {
    throw new Error('CV safe storage must be isolated from upload and quarantine storage');
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
