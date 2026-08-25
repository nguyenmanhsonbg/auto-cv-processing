import type { AmisCandidateStageChangedPayload } from '@/types/types';

export const AMIS_CANDIDATE_STAGE_CHANGED_MESSAGE_TYPE = 'AMIS_CANDIDATE_STAGE_CHANGED' as const;

export interface AmisCandidateStageRuntimeMessage {
  type: typeof AMIS_CANDIDATE_STAGE_CHANGED_MESSAGE_TYPE;
  payload: AmisCandidateStageChangedPayload;
  sourceTabId?: number;
  relayed?: boolean;
}

export function createAmisCandidateStageRelayMessage(
  payload: AmisCandidateStageChangedPayload,
  sourceTabId?: number,
): AmisCandidateStageRuntimeMessage {
  return {
    type: AMIS_CANDIDATE_STAGE_CHANGED_MESSAGE_TYPE,
    payload,
    ...(sourceTabId === undefined ? {} : { sourceTabId }),
    relayed: true,
  };
}

export function isAmisCandidateStageRuntimeMessage(
  value: unknown,
): value is AmisCandidateStageRuntimeMessage {
  if (typeof value !== 'object' || value === null) return false;
  if ((value as { type?: unknown }).type !== AMIS_CANDIDATE_STAGE_CHANGED_MESSAGE_TYPE) return false;

  const payload = (value as { payload?: unknown }).payload;
  if (typeof payload !== 'object' || payload === null) return false;

  const stage = payload as Partial<AmisCandidateStageChangedPayload>;
  return typeof stage.amisRecruitmentId === 'string'
    && stage.amisRecruitmentId.trim().length > 0
    && typeof stage.amisCandidateId === 'string'
    && stage.amisCandidateId.trim().length > 0
    && typeof stage.amisRecruitmentRoundId === 'string'
    && stage.amisRecruitmentRoundId.trim().length > 0
    && (stage.amisRecruitmentRoundName === null || typeof stage.amisRecruitmentRoundName === 'string')
    && (stage.amisStatus === null || typeof stage.amisStatus === 'number')
    && (stage.reasonRemoved === undefined || stage.reasonRemoved === null || typeof stage.reasonRemoved === 'string')
    && typeof stage.sourceUrl === 'string'
    && typeof stage.pageUrl === 'string'
    && typeof stage.changedAt === 'string'
    && (stage.amisRecruitmentRoundType === undefined
      || stage.amisRecruitmentRoundType === null
      || typeof stage.amisRecruitmentRoundType === 'number')
    && (stage.amisRecruitmentRoundSortOrder === undefined
      || stage.amisRecruitmentRoundSortOrder === null
      || typeof stage.amisRecruitmentRoundSortOrder === 'number')
    && (stage.previousAmisRecruitmentRoundId === undefined
      || stage.previousAmisRecruitmentRoundId === null
      || typeof stage.previousAmisRecruitmentRoundId === 'string')
    && (stage.previousAmisRecruitmentRoundName === undefined
      || stage.previousAmisRecruitmentRoundName === null
      || typeof stage.previousAmisRecruitmentRoundName === 'string')
    && (stage.previousAmisRecruitmentRoundType === undefined
      || stage.previousAmisRecruitmentRoundType === null
      || typeof stage.previousAmisRecruitmentRoundType === 'number')
    && (stage.previousAmisRecruitmentRoundSortOrder === undefined
      || stage.previousAmisRecruitmentRoundSortOrder === null
      || typeof stage.previousAmisRecruitmentRoundSortOrder === 'number')
    && ((value as { sourceTabId?: unknown }).sourceTabId === undefined
      || typeof (value as { sourceTabId?: unknown }).sourceTabId === 'number')
    && ((value as { relayed?: unknown }).relayed === undefined
      || typeof (value as { relayed?: unknown }).relayed === 'boolean');
}
