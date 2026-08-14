import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFreelancerIdentifierCopyText } from './referral-management-utils.ts';

test('builds freelancer identifier copy text', () => {
  assert.equal(
    buildFreelancerIdentifierCopyText('FL000001'),
    'FL000001',
  );
});