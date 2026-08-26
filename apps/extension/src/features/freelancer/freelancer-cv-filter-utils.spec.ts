import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildFreelancerCvPaginationPages,
  buildFreelancerCvStatusOptions,
  isFreelancerCvFormSent,
  matchesFreelancerCvStatus,
  normalizeFreelancerCvSearch,
} from './freelancer-cv-filter-utils.ts';

test('trims leading and trailing spaces from the Freelancer CV search on submit', () => {
  assert.equal(normalizeFreelancerCvSearch('  Vu Manh Tien  '), 'Vu Manh Tien');
  assert.equal(normalizeFreelancerCvSearch('Frontend  Developer'), 'Frontend  Developer');
  assert.equal(normalizeFreelancerCvSearch('   '), '');
});

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

test('maps FORM_SENT applications to the Screening CV filter', () => {
  const options = buildFreelancerCvStatusOptions([
    { id: 'form-sent', name: 'Screening CV', sortOrder: 0 },
  ]);
  const application = {
    statusCategory: 'PROCESSING' as const,
    processStatus: 'FORM_SENT',
    hrReceptionStatus: null,
    currentAmisStage: null,
  };

  assert.equal(isFreelancerCvFormSent(application), true);
  assert.equal(matchesFreelancerCvStatus(application, 'form-sent', options), true);
});

test('builds dynamic Freelancer CV pagination pages', () => {
  assert.deepEqual(buildFreelancerCvPaginationPages(1, 10), [1, 2, 3, 'ellipsis', 9, 10]);
  assert.deepEqual(buildFreelancerCvPaginationPages(3, 10), [2, 3, 4, 'ellipsis', 9, 10]);
  assert.deepEqual(buildFreelancerCvPaginationPages(5, 10), [1, 2, 'ellipsis', 4, 5, 6, 'ellipsis', 9, 10]);
  assert.deepEqual(buildFreelancerCvPaginationPages(10, 10), [1, 2, 'ellipsis', 8, 9, 10]);
});
