import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveAutoSyncJobDescriptionId } from './amis-auto-sync-payload.ts';

test('uses the Job Description created from the AMIS save response when no tab selection exists', () => {
  assert.equal(resolveAutoSyncJobDescriptionId(null, 'jd-from-amis-response'), 'jd-from-amis-response');
});

test('preserves an explicitly selected Job Description for the AMIS posting', () => {
  assert.equal(resolveAutoSyncJobDescriptionId('selected-jd', 'jd-from-amis-response'), 'selected-jd');
});
