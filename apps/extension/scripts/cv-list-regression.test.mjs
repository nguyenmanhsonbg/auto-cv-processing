import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../src/side-panel.tsx', import.meta.url), 'utf8');

test('CV list does not render the select-all checkbox', () => {
  assert.doesNotMatch(source, /className="cv-select-all-control"/);
});

test('CV empty state does not render the AMIS refresh instruction', () => {
  assert.doesNotMatch(source, /Mở AMIS recruitment có ứng viên hoặc refresh sau khi autosync chạy\./);
});

test('CV pagination is hidden when there are no filtered applications', () => {
  assert.match(
    source,
    /\{filteredApplications\.length > 0 && \(\s*<div className="cv-list-pagination">/s,
  );
});

test('logout resets CV filters and pagination', () => {
  const logoutBlock = source.match(/async function logout\(\) \{[\s\S]*?\n  \}/)?.[0] ?? '';
  assert.match(logoutBlock, /setCvQuestionFilter\('ALL'\)/);
  assert.match(logoutBlock, /setCvSyncFilter\('ALL'\)/);
  assert.match(logoutBlock, /setCvEvaluationFilter\('ALL'\)/);
  assert.match(logoutBlock, /setCvSourceFilter\('ALL'\)/);
  assert.match(logoutBlock, /setCvSortMode\('APPLIED_DESC'\)/);
  assert.match(logoutBlock, /setCvApplicationPage\(1\)/);
});
