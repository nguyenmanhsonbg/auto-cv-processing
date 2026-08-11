import { BadRequestException } from '@nestjs/common';
import { isEmailAddress } from '@interview-assistant/shared';

export function isInternalEmail(value?: string | null) {
  const normalized = value?.trim() ?? '';
  const atIndex = normalized.lastIndexOf('@');
  return isEmailAddress(normalized)
    && normalized.slice(atIndex + 1).toLowerCase() === 'viettel.com.vn';
}

export function normalizeInternalEmail(
  value: string,
  options?: { optional?: false },
): string;
export function normalizeInternalEmail(
  value: string | null | undefined,
  options: { optional: true },
): string | null;
export function normalizeInternalEmail(
  value: string | null | undefined,
  options: { optional?: boolean } = {},
): string | null {
  const normalized = value?.trim().toLowerCase() ?? '';
  if (!normalized && options.optional) return null;
  if (!isInternalEmail(normalized)) {
    throw new BadRequestException({
      code: 'INVALID_INTERNAL_EMAIL',
      message: 'Internal email is invalid.',
    });
  }
  return normalized;
}
