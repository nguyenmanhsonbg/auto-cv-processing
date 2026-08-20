import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildFreelancerCvStatusOptions,
  matchesFreelancerCvStatus,
} from './freelancer-cv-filter-utils.ts';

test('builds round options for the selected JD and keeps terminal status filters', () => {
  const options = buildFreelancerCvStatusOptions([
    { id: 'round-1', name: 'Ứng tuyển', sortOrder: 1 },
    { id: 'round-2', name: 'Phỏng vấn', sortOrder: 2 },
  ]);

  assert.deepEqual(
    options.map((option) => option.value),
    ['ALL', 'round-1', 'round-2', 'PROCESSING', 'PASSED', 'REJECTED'],
  );
  assert.equal(options.find((option) => option.value === 'round-2')?.label, 'Phỏng vấn');
});

test('matches an application by AMIS round id, name, or terminal category', () => {
  const options = buildFreelancerCvStatusOptions([
    { id: 'round-2', name: 'Phỏng vấn', sortOrder: 2 },
  ]);
  const application = {
    statusCategory: 'PROCESSING' as const,
    currentAmisStage: {
      recruitmentRoundId: 'round-2',
      recruitmentRoundName: 'Phỏng vấn',
      amisStatus: 1,
    },
  };

  assert.equal(matchesFreelancerCvStatus(application, 'round-2', options), true);
  assert.equal(matchesFreelancerCvStatus(application, 'PROCESSING', options), true);
  assert.equal(matchesFreelancerCvStatus({ ...application, statusCategory: 'REJECTED' }, 'REJECTED', options), true);
});
