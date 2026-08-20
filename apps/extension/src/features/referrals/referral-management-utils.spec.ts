import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildFreelancerIdentifierCopyText,
  isDateRangeComplete,
  isValueWithinDateRange,
  usesDynamicReferralRounds,
} from './referral-management-utils.ts';

test('builds freelancer identifier copy text', () => {
  assert.equal(
    buildFreelancerIdentifierCopyText('FL000001'),
    'FL000001',
  );
});

test('uses dynamic recruitment rounds for Freelancer and Internal tabs', () => {
  assert.equal(usesDynamicReferralRounds('FREELANCER'), true);
  assert.equal(usesDynamicReferralRounds('INTERNAL'), true);
});

test('date range includes JD timestamps on both boundary dates', () => {
  const range = { from: '2026-07-23', to: '2026-08-22' };

  assert.equal(isDateRangeComplete(range), true);
  assert.equal(isValueWithinDateRange('2026-07-23T01:00:00.000Z', range), true);
  assert.equal(isValueWithinDateRange('2026-08-22T12:00:00.000Z', range), true);
  assert.equal(isValueWithinDateRange('2026-07-22T12:00:00.000Z', range), false);
  assert.equal(isValueWithinDateRange('2026-08-23T12:00:00.000Z', range), false);
});

test('date range does not match invalid or incomplete values', () => {
  assert.equal(isDateRangeComplete({ from: '2026-07-23', to: '' }), false);
  assert.equal(isValueWithinDateRange('not-a-date', { from: '2026-07-23', to: '2026-08-22' }), false);
  assert.equal(isValueWithinDateRange(null, { from: '2026-07-23', to: '2026-08-22' }), false);
});
