export function formatCandidateValue(value?: string | null) {
  if (!value?.trim()) return '-';
  return value;
}

export function getCandidateStatusBadgeClassName(isActive: boolean) {
  return isActive ? 'bg-green-100 text-green-800' : 'bg-zinc-100 text-zinc-700';
}

type CandidateStatusLabels = { active: string; inactive: string };

const DEFAULT_CANDIDATE_STATUS_LABELS: CandidateStatusLabels = {
    active: 'Hoạt động',
    inactive: 'Ngừng hoạt động',
  };

export function getCandidateStatusLabel(
  isActive: boolean,
  labels: CandidateStatusLabels = DEFAULT_CANDIDATE_STATUS_LABELS,
) {
  return isActive ? labels.active : labels.inactive;
}
