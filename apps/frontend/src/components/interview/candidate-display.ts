export function formatCandidateValue(value?: string | null) {
  if (!value?.trim()) return '-';
  return value;
}

export function getCandidateStatusBadgeClassName(isActive: boolean) {
  return isActive ? 'bg-green-100 text-green-800' : 'bg-zinc-100 text-zinc-700';
}

export function getCandidateStatusLabel(
  isActive: boolean,
  labels: { active: string; inactive: string } = {
    active: 'Hoạt động',
    inactive: 'Ngừng hoạt động',
  },
) {
  return isActive ? labels.active : labels.inactive;
}
