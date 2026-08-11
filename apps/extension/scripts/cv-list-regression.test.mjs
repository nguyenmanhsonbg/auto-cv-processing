import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../src/app/side-panel.tsx', import.meta.url), 'utf8');

test('CV list renders the select-all checkbox', () => {
  assert.match(source, /className="cv-select-all-control"/);
  assert.match(source, /aria-label="Chọn tất cả ứng viên"/);
  assert.match(source, /toggleAllCvCandidateSelection\(filteredApplications\.map\(/);
});

test('CV empty state does not render the AMIS refresh instruction', () => {
  assert.doesNotMatch(source, /Mở AMIS recruitment có ứng viên hoặc refresh sau khi autosync chạy\./);
});

test('CV pagination is hidden when filtered applications fit on one page', () => {
  assert.match(
    source,
    /\{filteredApplications\.length > CV_APPLICATION_PAGE_SIZE && \(\s*<div className="cv-list-pagination">/s,
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

test('bulk CV sync is enabled from selection without stale AMIS form state', () => {
  assert.match(
    source,
    /className="cv-bulk-sync-button"\s+disabled=\{selectedFilteredUploadableCount === 0 \|\| Boolean\(cvUploadApplicationId\)\}/s,
  );
});

test('application date displays date before time without a comma', () => {
  const formatter = source.match(/function formatDateTime\(value: string \| undefined\) \{[\s\S]*?\n\}/)?.[0] ?? '';
  assert.match(formatter, /toLocaleTimeString\('vi-VN'/);
  assert.match(formatter, /toLocaleDateString\('vi-VN'/);
  assert.match(formatter, /return `\$\{dateLabel\} \$\{timeLabel\}`/);
});

test('CV candidate card renders the CV note with an empty-state fallback', () => {
  assert.match(source, /className="cv-candidate-note"/);
  assert.match(source, /Ghi chú của CV/);
  assert.match(source, /CV này không có ghi chú nào\./);
});

test('candidate score uses success, warning, and danger color tones', () => {
  assert.match(source, /getCvScoreTone\(score\)/);
  assert.match(source, /if \(score >= 80\) return 'is-success'/);
  assert.match(source, /if \(score >= 50\) return 'is-warning'/);
  assert.match(source, /className={`cv-candidate-score \$\{getCvScoreTone\(score\)\}`}/);
});
