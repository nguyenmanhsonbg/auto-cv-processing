import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(
  new URL('../src/features/referrals/referral-management.tsx', import.meta.url),
  'utf8',
);

test('management tabs render one people list and one shared pagination source', () => {
  const peopleListCount = source.match(/className="referral-people-list"/g)?.length ?? 0;

  assert.equal(peopleListCount, 1);
  assert.equal((source.match(/<ReferralPeopleContent\b/g) ?? []).length, 1);
  assert.match(source, /visibleTotalPages > 1/);
});
