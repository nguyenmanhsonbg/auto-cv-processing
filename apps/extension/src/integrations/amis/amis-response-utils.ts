export const AMIS_APPLICATIONS_CANDIDATES_MARKER = 'Candidates';

const AMIS_ROW_ARRAY_KEYS = [
  'Data',
  'data',
  'Items',
  'items',
  'Rows',
  'rows',
  'PageData',
  'pageData',
  'Records',
  'records',
] as const;

export function extractAmisRows(value: unknown): unknown[] {
  const directRows = readAmisKnownRowArray(value);
  if (directRows) return directRows;

  if (!isAmisRecord(value)) return [];

  for (const item of Object.values(value)) {
    const nestedRows = extractAmisRows(item);
    if (nestedRows.length > 0) return nestedRows;
  }

  return [];
}

export function extractAmisCandidateRows(
  value: unknown,
  marker = AMIS_APPLICATIONS_CANDIDATES_MARKER,
): unknown[] {
  if (Array.isArray(value)) return looksLikeAmisCandidateRowArray(value) ? value : [];
  if (!isAmisRecord(value)) return [];

  const candidates = value[marker];
  if (Array.isArray(candidates) && looksLikeAmisCandidateRowArray(candidates)) return candidates;

  for (const child of Object.values(value)) {
    const rows = extractAmisCandidateRows(child, marker);
    if (rows.length > 0) return rows;
  }

  return [];
}

function looksLikeAmisCandidateRowArray(rows: unknown[]) {
  return rows.some((row) =>
    isAmisRecord(row)
    && hasAmisTextOrNumber(row, ['RecruitmentID', 'recruitmentId'])
    && hasAmisTextOrNumber(row, ['RecruitmentRoundID', 'recruitmentRoundId'])
    && hasAmisTextOrNumber(row, ['CandidateID', 'candidateId']),
  );
}

function readAmisKnownRowArray(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (!isAmisRecord(value)) return null;

  for (const key of AMIS_ROW_ARRAY_KEYS) {
    const child = value[key];
    if (Array.isArray(child)) return child;
  }

  return null;
}

function hasAmisTextOrNumber(data: Record<string, unknown>, keys: readonly string[]) {
  for (const key of keys) {
    const value = data[key];
    if ((typeof value === 'string' || typeof value === 'number') && String(value)) return true;
  }

  return false;
}

function isAmisRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
