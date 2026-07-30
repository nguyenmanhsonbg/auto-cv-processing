import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AMIS_CANDIDATE_STAGE_CHANGED_MESSAGE_TYPE,
  createAmisCandidateStageRelayMessage,
  isAmisCandidateStageRuntimeMessage,
} from './background-message-relay.ts';

const payload = {
  amisRecruitmentId: '45066',
  amisCandidateId: '987810',
  amisRecruitmentRoundId: '256798',
  amisRecruitmentRoundName: 'Vòng loại CV',
  reasonRemoved: null,
  amisStatus: 1,
  sourceUrl: 'https://amisapp.misa.vn/recruitment/APIS/g1/RecruitmentAPI/api/RecruitmentDetail/updateRound',
  pageUrl: 'https://amisapp.misa.vn/recruit/job/detail/45066?roundID=256797&recTabID=1',
  changedAt: '2026-07-28T08:27:12.434Z',
};

test('accepts and relays a candidate stage event with its source tab', () => {
  const message = createAmisCandidateStageRelayMessage(payload, 42);

  assert.equal(message.type, AMIS_CANDIDATE_STAGE_CHANGED_MESSAGE_TYPE);
  assert.equal(message.sourceTabId, 42);
  assert.deepEqual(message.payload, payload);
  assert.equal(isAmisCandidateStageRuntimeMessage(message), true);
});

test('rejects a stage event without the required AMIS identifiers', () => {
  assert.equal(isAmisCandidateStageRuntimeMessage({
    type: AMIS_CANDIDATE_STAGE_CHANGED_MESSAGE_TYPE,
    payload: { ...payload, amisCandidateId: '' },
  }), false);
});
