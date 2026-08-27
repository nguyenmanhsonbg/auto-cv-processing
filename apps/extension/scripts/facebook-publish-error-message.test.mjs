import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const appSidePanelSource = await readFile(
  new URL('../src/app/side-panel.tsx', import.meta.url),
  'utf8',
);
const postingPanelSource = await readFile(
  new URL('../src/features/posting/JobPostingPanel.tsx', import.meta.url),
  'utf8',
);

test('Facebook publish failure keeps the error state without exposing the technical summary message', () => {
  const failureStart = appSidePanelSource.indexOf(
    "if (publishResult && publishResult.summary.successCount === 0)",
  );
  const successStateStart = appSidePanelSource.indexOf("setState('SUCCESS')", failureStart);
  const failureSource = appSidePanelSource.slice(failureStart, successStateStart);

  assert.ok(failureStart >= 0, 'Facebook publish failure branch should exist');
  assert.ok(successStateStart > failureStart, 'Facebook publish failure branch should be bounded');
  assert.match(failureSource, /setError\(null\)/);
  assert.match(failureSource, /setState\('ERROR'\)/);
  assert.doesNotMatch(failureSource, /publishResult\.summary\.message/);
});

test('Facebook result panel still renders user-facing failure statuses', () => {
  assert.match(postingPanelSource, /'Đăng lỗi'/);
  assert.match(postingPanelSource, /facebook-publish-results-state/);
  assert.match(postingPanelSource, /facebook-publish-result-state/);
});
