import { BadRequestException } from '@nestjs/common';

export const INTERNAL_EMAIL_PATTERN = /^[^\s@]+@viettel\.com\.vn$/i;

export function isInternalEmail(value?: string | null) {
  return INTERNAL_EMAIL_PATTERN.test(value?.trim() ?? '');
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
      message: 'Internal email must use the @viettel.com.vn domain.',
    });
  }
  return normalized;
}
