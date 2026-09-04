import type { AmisCandidateStageChangedPayload } from '@/types/types';

/**
 * AMIS's updateRound response is only an acknowledgement (`Data: true`).
 * The candidate and destination round are therefore read from the request.
 */
export function mapAmisCandidateStageRequest(
  request: unknown,
  sourceUrl: string,
  pageUrl: string,
  changedAt = new Date().toISOString(),
): AmisCandidateStageChangedPayload[] {
  if (!isObject(request)) return [];

  const amisRecruitmentId = cleanText(readFirst(request, [
    'RecruitmentID',
    'RecruitmentId',
    'recruitmentId',
    'recruitmentID',
  ]));
  const defaultRoundId = cleanText(readFirst(request, [
    'RecruitmentRoundID',
    'RecruitmentRoundId',
    'recruitmentRoundId',
  ]));
  const candidateIds = readCandidateIds(readFirstValue(request, [
    'CandidateIDs',
    'CandidateIds',
    'candidateIds',
  ]));
  const roundTimeByCandidateId = readRoundTimes(
    readFirstValue(request, ['RecruitmentRoundTimes', 'recruitmentRoundTimes']),
    candidateIds,
  );

  if (!amisRecruitmentId || candidateIds.size === 0) return [];

  return [...candidateIds].map((amisCandidateId) => {
    const roundTime = roundTimeByCandidateId.get(amisCandidateId);
    const amisRecruitmentRoundId = cleanText(readFirst(roundTime ?? {}, [
      'RecruitmentRoundID',
      'RecruitmentRoundId',
      'recruitmentRoundId',
    ])) || defaultRoundId;
    const amisRecruitmentRoundName = cleanText(readFirst(roundTime ?? {}, [
      'RecruitmentRoundName',
      'recruitmentRoundName',
    ]));

    return {
      amisRecruitmentId,
      amisCandidateId,
      amisRecruitmentRoundId: amisRecruitmentRoundId || null,
      amisRecruitmentRoundName: amisRecruitmentRoundName || null,
      reasonRemoved: null,
      amisStatus: null,
      sourceUrl,
      pageUrl,
      changedAt,
      isTransitionEvent: true,
    };
  });
}

function readCandidateIds(value: unknown) {
  const candidateIds = new Set<string>();
  const values = normalizeCandidateIdValues(value);

  for (const candidateId of values) {
    const normalizedCandidateId = cleanText(candidateId);
    if (normalizedCandidateId) candidateIds.add(normalizedCandidateId);
  }

  return candidateIds;
}

function normalizeCandidateIdValues(value: unknown): unknown[] {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value).split(/[;,]/);
  }
  if (Array.isArray(value)) return value;
  return [];
}

function readRoundTimes(
  value: unknown,
  candidateIds: Set<string>,
) {
  const roundTimeByCandidateId = new Map<string, Record<string, unknown>>();
  if (!Array.isArray(value)) return roundTimeByCandidateId;

  for (const item of value) {
    if (!isObject(item)) continue;
    const candidateId = cleanText(readFirst(item, ['CandidateID', 'CandidateId', 'candidateId']));
    if (!candidateId) continue;
    candidateIds.add(candidateId);
    roundTimeByCandidateId.set(candidateId, item);
  }

  return roundTimeByCandidateId;
}

function readFirst(data: Record<string, unknown>, keys: string[]) {
  const value = readFirstValue(data, keys);
  if (typeof value === 'string' || typeof value === 'number') return String(value);

  return '';
}

function readFirstValue(data: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = data[key];
    if (value === undefined || value === null) continue;
    return value;
  }

  return undefined;
}

function cleanText(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).trim();
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
