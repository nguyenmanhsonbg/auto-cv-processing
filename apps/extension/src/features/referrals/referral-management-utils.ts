export function buildFreelancerIdentifierCopyText(identifier: string) {
  return identifier.trim();
}

export function buildReferralPaginationPages(
  currentPage: number,
  totalPages: number,
): Array<number | 'ellipsis'> {
  const safeTotal = Math.max(1, totalPages);
  const safeCurrent = Math.min(Math.max(1, currentPage), safeTotal);

  if (safeTotal <= 7) {
    return Array.from({ length: safeTotal }, (_, index) => index + 1);
  }

  if (safeCurrent <= 2) return [1, 2, 3, 'ellipsis', safeTotal - 1, safeTotal];
  if (safeCurrent === 3) return [2, 3, 4, 'ellipsis', safeTotal - 1, safeTotal];
  if (safeCurrent >= safeTotal - 2) return [1, 2, 'ellipsis', safeTotal - 2, safeTotal - 1, safeTotal];

  return [1, 2, 'ellipsis', safeCurrent - 1, safeCurrent, safeCurrent + 1, 'ellipsis', safeTotal - 1, safeTotal];
}

export function usesDynamicReferralRounds(source: 'FREELANCER' | 'INTERNAL') {
  return source === 'FREELANCER' || source === 'INTERNAL';
}

export type ReferralDateRangeValue = {
  from: string;
  to: string;
};

export function isDateRangeComplete(range: ReferralDateRangeValue) {
  const from = parseDateOnly(range.from);
  const to = parseDateOnly(range.to);
  return Boolean(from && to && from <= to);
}

export function isValueWithinDateRange(value: string | null | undefined, range: ReferralDateRangeValue) {
  if (!value || !isDateRangeComplete(range)) return false;

  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return false;

  const localDate = formatLocalDate(timestamp);
  return localDate >= range.from && localDate <= range.to;
}

export function filterReferralApplicationsByDateRange<T extends { appliedAt?: string | null }>(
  applications: T[],
  range: ReferralDateRangeValue,
) {
  return applications.filter((application) => isValueWithinDateRange(application.appliedAt, range));
}

function parseDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) return null;

  return value;
}

function formatLocalDate(value: Date) {
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}
