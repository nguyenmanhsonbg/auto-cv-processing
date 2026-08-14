export function valueOrDash(value?: string | number | boolean | null) {
  if (value === undefined || value === null || value === '') return '-';
  return String(value);
}

export function scoreLabel(value?: number | null) {
  return typeof value === 'number' ? `${value}` : '-';
}
