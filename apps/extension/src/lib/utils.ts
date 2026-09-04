import { secureRandomFraction, secureRandomUUID } from '@interview-assistant/shared';
import { toVietnameseErrorMessage } from './error-messages';

export { secureRandomFraction, secureRandomUUID };

export function uniqueStrings(value: string[]): string[] {
  return [...new Set(value.map((item) => item.trim()).filter(Boolean))];
}

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

const UINT32_MODULUS = 0x1_0000_0000;
const INT32_SIGN_BIT = 0x8000_0000;

export function hashText(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    const wrappedHash = (
      (hash * 31 + (value.codePointAt(index) ?? 0)) % UINT32_MODULUS
      + UINT32_MODULUS
    ) % UINT32_MODULUS;
    const unsignedHash = Math.trunc(wrappedHash);
    hash = unsignedHash >= INT32_SIGN_BIT
      ? unsignedHash - UINT32_MODULUS
      : unsignedHash;
  }
  return Math.abs(hash).toString(36);
}

export function truncateForMaxLength(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength ? normalized.slice(0, maxLength) : normalized;
}

export function formatFileSize(size: number): string {
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(size >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  }

  if (size >= 1024) {
    return `${Math.ceil(size / 1024)} KB`;
  }

  return `${size} B`;
}

export function formatDate(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
}

export function arrayBufferToBase64(value: ArrayBuffer): string {
  const bytes = new Uint8Array(value);
  const chunkSize = 0x8000;
  let binary = '';

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function normalizeOptionalText(value?: string | null): string | null {
  const normalized = value?.trim();
  return normalized || null;
}

export function normalizeStatus(value?: string | null): string {
  return value?.toUpperCase().trim() ?? '';
}

export function toErrorMessage(error: unknown): string {
  return toVietnameseErrorMessage(error);
}

export function isValidPhone(phone: string): boolean {
  if (!phone) return false;
  const normalized = phone.trim();
  return /^(0|\+?84)[235789]\d{8,9}$/.test(normalized);
}

export function validatePhone(phone: string): string | null {
  if (!phone) return null;
  const normalized = phone.trim();
  if (!normalized) return null;
  if (!isValidPhone(normalized)) {
    return 'Số điện thoại không hợp lệ (VD: 0987098098)';
  }
  return null;
}

export function limitPhoneInput(value: string, maxLength = 12): string {
  return value.replace(/[^\d+]/g, '').slice(0, maxLength);
}

export function stripHtmlTags(value: string): string {
  let result = '';
  let cursor = 0;

  while (cursor < value.length) {
    const tagStart = value.indexOf('<', cursor);
    if (tagStart < 0) return result + value.slice(cursor);

    result += value.slice(cursor, tagStart);
    const tagEnd = value.indexOf('>', tagStart + 1);
    if (tagEnd < 0) return result + value.slice(tagStart);
    cursor = tagEnd + 1;
  }

  return result;
}

export function removeHorizontalWhitespaceBeforeNewlines(value: string): string {
  let result = '';
  let pendingWhitespace = '';

  for (const character of value) {
    if (character === ' ' || character === '\t') {
      pendingWhitespace += character;
      continue;
    }

    if (character === '\n') {
      result += '\n';
      pendingWhitespace = '';
      continue;
    }

    result += pendingWhitespace + character;
    pendingWhitespace = '';
  }

  return result + pendingWhitespace;
}

export function trimTrailingSlashes(value: string): string {
  let normalized = value;
  while (normalized.endsWith('/')) normalized = normalized.slice(0, -1);
  return normalized;
}
