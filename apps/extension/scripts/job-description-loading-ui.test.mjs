import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const componentSource = await readFile(
  new URL('../src/features/posting/JobPostingPanel.tsx', import.meta.url),
  'utf8',
);

test('JD loading status is announced without rendering a flickering layout row', () => {
  assert.match(
    componentSource,
    /\{jobDescriptionStatus === 'LOADING' \? \(\s*<span className="visually-hidden" role="status" aria-live="polite">\s*Đang tải danh sách JD\.\.\.\s*<\/span>\s*\) : null\}/,
  );
  assert.doesNotMatch(
    componentSource,
    /<p className="muted-text">Đang tải danh sách JD\.\.\.<\/p>/,
  );
});
