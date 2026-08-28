import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const panelSource = await readFile(
  new URL('../src/features/posting/JobPostingPanel.tsx', import.meta.url),
  'utf8',
);

const searchFieldStart = panelSource.indexOf('className="jd-search-field"');
const searchFieldEnd = panelSource.indexOf('/>', searchFieldStart);
const searchFieldSource = panelSource.slice(searchFieldStart, searchFieldEnd);

test('JD search input limits typed and pasted values to 255 characters', () => {
  assert.ok(searchFieldStart >= 0, 'JD search field should exist');
  assert.ok(searchFieldEnd > searchFieldStart, 'JD search field should be bounded');
  assert.match(searchFieldSource, /maxLength=\{JOB_DESCRIPTION_SEARCH_MAX_LENGTH\}/);
  assert.match(searchFieldSource, /const limitedValue = value\.slice\(0, JOB_DESCRIPTION_SEARCH_MAX_LENGTH\)/);
});
