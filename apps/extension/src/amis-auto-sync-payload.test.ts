import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveSelectedVcsJobDescriptionId } from './amis-auto-sync-payload.ts';

test('does not fall back to a Job Description created from the AMIS response', () => {
  assert.equal(resolveSelectedVcsJobDescriptionId(null), null);
});

test('preserves an explicitly selected Job Description for the AMIS posting', () => {
  assert.equal(resolveSelectedVcsJobDescriptionId('selected-jd'), 'selected-jd');
});
