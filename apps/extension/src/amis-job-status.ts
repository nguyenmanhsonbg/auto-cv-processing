export type AmisJobStatus = 1 | 2 | 3 | 5;

export interface AmisJobStatusUpdate {
  amisRecruitmentId: string;
  amisStatus: AmisJobStatus;
}

export function extractAmisJobStatusUpdate(payload: unknown): AmisJobStatusUpdate | null {
  const visited = new Set<unknown>();

  function visit(value: unknown): AmisJobStatusUpdate | null {
    if (!value || typeof value !== 'object' || visited.has(value)) return null;
    visited.add(value);

    const record = value as Record<string, unknown>;
    const recruitmentId = readString(record, [
      'recruitmentID',
      'recruitmentId',
      'RecruitmentID',
      'RecruitmentId',
      'amisRecruitmentId',
    ]);
    const status = readNumber(record, ['status', 'Status']);
    if (recruitmentId && isSupportedStatus(status)) {
      return { amisRecruitmentId: recruitmentId, amisStatus: status };
    }

    for (const child of Object.values(record)) {
      const result = visit(child);
      if (result) return result;
    }

    return null;
  }

  return visit(payload);
}

function readString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
}

function readNumber(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() && /^\d+$/.test(value.trim())) {
      return Number(value.trim());
    }
  }
  return null;
}

function isSupportedStatus(value: number | null): value is AmisJobStatus {
  return value === 1 || value === 2 || value === 3 || value === 5;
}
