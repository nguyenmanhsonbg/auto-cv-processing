import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const managementSource = await readFile(
  new URL('../src/features/referrals/referral-management.tsx', import.meta.url),
  'utf8',
);
const stylesSource = await readFile(
  new URL('../src/app/styles.css', import.meta.url),
  'utf8',
);

test('HR Freelancer filters render the design time range control', () => {
  assert.match(managementSource, /DateRangeFilter/);
  assert.match(managementSource, /dateRangeFilter/);
  assert.match(managementSource, /<DateRangeFilter\b/);
});

test('HR Freelancer filter row uses two design columns and places time on the right', () => {
  const filterRowRule = stylesSource.match(/\.referral-filter-row\s*\{[^}]*\}/)?.[0] ?? '';
  const timeRule = stylesSource.match(/\.referral-filter-row \.shared-filter-date-range\s*\{[^}]*\}/)?.[0] ?? '';

  assert.match(filterRowRule, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/);
  assert.match(timeRule, /grid-column:\s*2;/);
});

test('time range filters Freelancer applications by the linked JD creation time', () => {
  assert.match(managementSource, /isDateRangeComplete/);
  assert.match(managementSource, /isValueWithinDateRange/);
  assert.match(managementSource, /const isDateFilterActive = \(source === 'FREELANCER' \|\| source === 'INTERNAL'\)/);
  assert.match(managementSource, /jobPostingCreatedAtById/);
  assert.match(managementSource, /application\.jobPosting\.jobPostingId/);
  assert.match(managementSource, /cvStatusFilter === 'ALL' && isAllJdSelected && !isDateFilterActive && person\.applications\.length === 0/);
  assert.match(managementSource, /setPage\(1\)/);
});

test('time range is available for Internal and uses the three-column design row', () => {
  assert.match(managementSource, /source === 'FREELANCER' \|\| source === 'INTERNAL'/);

  const internalFilterRowRule = stylesSource.match(/\.referral-filter-row\.is-internal\s*\{[^}]*\}/)?.[0] ?? '';
  const internalTimeRule = stylesSource.match(/\.referral-filter-row\.is-internal \.shared-filter-date-range\s*\{[^}]*\}/)?.[0] ?? '';
  assert.match(internalFilterRowRule, /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);/);
  assert.match(internalTimeRule, /grid-column:\s*3;/);
});
