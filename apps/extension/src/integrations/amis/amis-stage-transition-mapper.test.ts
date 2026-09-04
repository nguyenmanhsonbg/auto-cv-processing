import assert from 'node:assert/strict';
import test from 'node:test';
import { mapAmisCandidateStageRequest } from './amis-stage-transition-mapper.ts';

const updateRoundRequest = {
  RecruitmentID: 46669,
  RecruitmentRoundID: 265430,
  CandidateIDs: '1015941',
  RecruitmentRoundTimes: [
    {
      State: 1,
      CandidateID: 1015941,
      RecruitmentID: 46669,
      ChangeRoundTime: '2026-09-04T09:23:46.947Z',
      RecruitmentRoundID: 265430,
      RecruitmentRoundName: 'Phỏng vấn 1',
      SortOrder: 3,
    },
  ],
};

test('maps a successful AMIS updateRound request into a transition event', () => {
  const captures = mapAmisCandidateStageRequest(
    updateRoundRequest,
    'https://amisapp.misa.vn/recruitment/APIS/g1/RecruitmentAPI/api/RecruitmentDetail/updateRound',
    'https://amisapp.misa.vn/recruit/job/detail/46669?roundID=265430&recTabID=1',
    '2026-09-04T09:23:47.000Z',
  );

  assert.deepEqual(captures, [{
    amisRecruitmentId: '46669',
    amisCandidateId: '1015941',
    amisRecruitmentRoundId: '265430',
    amisRecruitmentRoundName: 'Phỏng vấn 1',
    reasonRemoved: null,
    amisStatus: null,
    sourceUrl: 'https://amisapp.misa.vn/recruitment/APIS/g1/RecruitmentAPI/api/RecruitmentDetail/updateRound',
    pageUrl: 'https://amisapp.misa.vn/recruit/job/detail/46669?roundID=265430&recTabID=1',
    changedAt: '2026-09-04T09:23:47.000Z',
    isTransitionEvent: true,
  }]);
});

test('maps all candidates when AMIS sends a delimited CandidateIDs string', () => {
  const captures = mapAmisCandidateStageRequest({
    ...updateRoundRequest,
    CandidateIDs: '1015941;1015853',
    RecruitmentRoundTimes: [
      updateRoundRequest.RecruitmentRoundTimes[0],
      { CandidateID: 1015853, RecruitmentRoundID: 265432, RecruitmentRoundName: 'Phỏng vấn 2' },
    ],
  }, 'https://amisapp.misa.vn/updateRound', 'https://amisapp.misa.vn/recruit/job/detail/46669', '2026-09-04T09:23:47.000Z');

  assert.deepEqual(captures.map((capture) => [
    capture.amisCandidateId,
    capture.amisRecruitmentRoundId,
    capture.amisRecruitmentRoundName,
    capture.isTransitionEvent,
  ]), [
    ['1015941', '265430', 'Phỏng vấn 1', true],
    ['1015853', '265432', 'Phỏng vấn 2', true],
  ]);
});
