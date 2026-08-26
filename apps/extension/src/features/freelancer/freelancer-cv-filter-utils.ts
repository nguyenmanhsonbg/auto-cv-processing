import type {
  AmisRecruitmentRound,
  ReferralManagementCurrentAmisStage,
  ReferralManagementStatusCategory,
} from '@/types/types';

export type FreelancerCvStatusOptionKind = 'ROUND' | 'PROCESSING' | 'PASSED' | 'REJECTED';

export interface FreelancerCvStatusOption {
  value: string;
  label: string;
  kind: FreelancerCvStatusOptionKind | 'ALL';
  roundIds: string[];
  normalizedName: string;
  sortOrder: number;
}

export interface FreelancerCvStatusApplicationLike {
  statusCategory: ReferralManagementStatusCategory;
  processStatus?: string | null;
  hrReceptionStatus?: string | null;
  currentAmisStage: Pick<ReferralManagementCurrentAmisStage, 'recruitmentRoundId' | 'recruitmentRoundName' | 'amisStatus'> | null;
}

export const FREELANCER_CV_SEARCH_MAX_LENGTH = 255;

export function limitFreelancerCvSearchInput(value: string): string {
  return Array.from(value).slice(0, FREELANCER_CV_SEARCH_MAX_LENGTH).join('');
}

export function normalizeFreelancerCvSearch(value: string): string {
  return value.trim();
}

const TERMINAL_OPTIONS: FreelancerCvStatusOption[] = [
  {
    value: 'PROCESSING',
    label: 'Đang xử lý',
    kind: 'PROCESSING',
    roundIds: [],
    normalizedName: '',
    sortOrder: Number.MAX_SAFE_INTEGER - 3,
  },
  {
    value: 'PASSED',
    label: 'Đã đậu',
    kind: 'PASSED',
    roundIds: [],
    normalizedName: '',
    sortOrder: Number.MAX_SAFE_INTEGER - 2,
  },
  {
    value: 'REJECTED',
    label: 'Không đạt',
    kind: 'REJECTED',
    roundIds: [],
    normalizedName: '',
    sortOrder: Number.MAX_SAFE_INTEGER - 1,
  },
];

export function buildFreelancerCvStatusOptions(
  rounds: Array<Pick<AmisRecruitmentRound, 'id' | 'name' | 'sortOrder'>>,
): FreelancerCvStatusOption[] {
  const groupedRounds = new Map<string, FreelancerCvStatusOption>();

  rounds.forEach((round) => {
    const label = round.name.trim();
    const normalizedName = normalizeFreelancerCvStageName(label);
    if (!label || !normalizedName) return;

    const key = normalizedName;
    const existing = groupedRounds.get(key);
    if (existing) {
      const roundId = round.id.trim();
      if (roundId && !existing.roundIds.includes(roundId)) existing.roundIds.push(roundId);
      existing.sortOrder = Math.min(existing.sortOrder, round.sortOrder);
      return;
    }

    const roundId = round.id.trim();
    groupedRounds.set(key, {
      value: roundId || `ROUND:${normalizedName}`,
      label,
      kind: 'ROUND',
      roundIds: roundId ? [roundId] : [],
      normalizedName,
      sortOrder: Number.isFinite(round.sortOrder) ? round.sortOrder : Number.MAX_SAFE_INTEGER - 4,
    });
  });

  return [
    {
      value: 'ALL',
      label: 'Tất cả các vòng',
      kind: 'ALL',
      roundIds: [],
      normalizedName: '',
      sortOrder: Number.MIN_SAFE_INTEGER,
    },
    ...[...groupedRounds.values()].sort((left, right) => (
      left.sortOrder - right.sortOrder || left.label.localeCompare(right.label, 'vi')
    )),
    ...TERMINAL_OPTIONS,
  ];
}

export function matchesFreelancerCvStatus(
  application: FreelancerCvStatusApplicationLike,
  filter: string,
  options: FreelancerCvStatusOption[],
) {
  if (filter === 'ALL') return true;

  const option = options.find((candidate) => candidate.value === filter);
  if (!option) return false;

  if (option.kind === 'PROCESSING') return application.statusCategory === 'PROCESSING';
  if (option.kind === 'PASSED') return application.statusCategory === 'PASSED';
  if (option.kind === 'REJECTED') {
    return application.statusCategory === 'REJECTED' || application.currentAmisStage?.amisStatus === 0;
  }

  if (
    option.normalizedName === normalizeFreelancerCvStageName('Screening CV')
    && isFreelancerCvFormSent(application)
  ) return true;

  const stageId = application.currentAmisStage?.recruitmentRoundId?.trim();
  const stageName = normalizeFreelancerCvStageName(application.currentAmisStage?.recruitmentRoundName);
  return Boolean(
    (stageId && option.roundIds.includes(stageId))
    || (stageName && stageName === option.normalizedName),
  );
}

export function normalizeFreelancerCvStageName(value?: string | null) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replaceAll('Đ', 'D')
    .replaceAll('đ', 'd')
    .toUpperCase()
    .trim();
}

export function isFreelancerCvFormSent(application: Pick<FreelancerCvStatusApplicationLike, 'processStatus' | 'hrReceptionStatus'>): boolean {
  return [application.processStatus, application.hrReceptionStatus]
    .some((value) => value?.trim().toUpperCase() === 'FORM_SENT');
}

export type FreelancerCvPaginationItem = number | 'ellipsis';

export function buildFreelancerCvPaginationPages(
  currentPage: number,
  totalPages: number,
): FreelancerCvPaginationItem[] {
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
