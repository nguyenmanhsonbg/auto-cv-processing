export interface AmisRecruitmentRoundSyncInput {
  amisRoundId: string;
  name: string;
  sortOrder?: number | null;
  roundType?: number | null;
  roundTypeId?: string | null;
  color?: string | null;
}

export interface NormalizedAmisRecruitmentRound {
  amisRoundId: string;
  name: string;
  sortOrder: number;
  roundType: number | null;
  roundTypeId: string | null;
  color: string | null;
}

export function normalizeAmisRecruitmentRounds(
  rounds: AmisRecruitmentRoundSyncInput[],
): NormalizedAmisRecruitmentRound[] {
  const normalized = new Map<string, NormalizedAmisRecruitmentRound>();

  for (const round of rounds) {
    const amisRoundId = round.amisRoundId.trim();
    const name = round.name.trim();
    if (!amisRoundId || !name || normalized.has(amisRoundId)) continue;

    normalized.set(amisRoundId, {
      amisRoundId,
      name,
      sortOrder: Number.isFinite(round.sortOrder) ? round.sortOrder as number : Number.MAX_SAFE_INTEGER,
      roundType: Number.isFinite(round.roundType) ? round.roundType as number : null,
      roundTypeId: round.roundTypeId?.trim() || null,
      color: round.color?.trim() || null,
    });
  }

  return [...normalized.values()].sort((left, right) => (
    left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, 'vi')
  ));
}

export function getInactiveAmisRecruitmentRoundIds(
  existingRoundIds: string[],
  incomingRoundIds: string[],
) {
  const incoming = new Set(incomingRoundIds.map((id) => id.trim()).filter(Boolean));
  return [...new Set(existingRoundIds.map((id) => id.trim()).filter(Boolean))]
    .filter((id) => !incoming.has(id));
}
