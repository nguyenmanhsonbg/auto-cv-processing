import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const referralManagementSource = await readFile(
  new URL('../src/features/referrals/referral-management.tsx', import.meta.url),
  'utf8',
);
const filterDropdownSource = await readFile(
  new URL('../src/components/filters/FilterDropdown.tsx', import.meta.url),
  'utf8',
);
const extensionStylesSource = await readFile(
  new URL('../src/app/styles.css', import.meta.url),
  'utf8',
);

test('Internal and Freelancer referral filters do not contain legacy hardcoded round fallbacks', () => {
  assert.doesNotMatch(referralManagementSource, /addLegacyReferralRoundOptions/);
  assert.doesNotMatch(referralManagementSource, /addRequiredReferralStatusOptions/);
  assert.doesNotMatch(referralManagementSource, /includeLegacyStageOptions/);
});

test('referral filter options are built from loaded AMIS rounds and current AMIS stages', () => {
  assert.match(
    referralManagementSource,
    /buildReferralRoundOptions\(\[\.\.\.configuredEntries, \.\.\.fallbackEntries\]\)/,
  );
});

test('referral status filter uses one custom menu while rounds are loading', () => {
  assert.match(referralManagementSource, /menuVariant="custom"/);
  assert.match(referralManagementSource, /className="referral-cv-status-filter"/);
  assert.match(referralManagementSource, /disabled=\{roundsFilterLoading\}/);
  assert.match(filterDropdownSource, /menuVariant === 'custom'/);
  assert.match(filterDropdownSource, /<div className=\{menuClassName\}[^>]*role="listbox"/);
  assert.match(filterDropdownSource, /menuVariant === 'native'[\s\S]*?<select/);
});

test('round filter stays interactive during a background refresh of the same JD scope', () => {
  assert.match(referralManagementSource, /roundsScopeKey/);
  assert.match(referralManagementSource, /roundsLoadedScopeKey/);
  assert.match(referralManagementSource, /const roundsFilterLoading =/);
  assert.match(referralManagementSource, /disabled=\{roundsFilterLoading\}/);
  assert.doesNotMatch(referralManagementSource, /disabled=\{roundsLoading\}/);
});

test('CV status filter matches the supplied dropdown design tokens', () => {
  assert.match(extensionStylesSource, /\.referral-cv-status-filter \{/);
  assert.match(extensionStylesSource, /\.referral-cv-status-filter \.cv-filter-label \{[\s\S]*?font-size: 14px;[\s\S]*?font-weight: 400;[\s\S]*?line-height: 19\.6px;[\s\S]*?color: #262626;/);
  assert.match(extensionStylesSource, /\.referral-cv-status-filter \.referral-filter-trigger \{[\s\S]*?height: 36px;[\s\S]*?border: 1px solid #E5E5E5;[\s\S]*?border-radius: 6px;[\s\S]*?padding: 7px 14px;/);
  assert.match(extensionStylesSource, /\.referral-cv-status-filter \.referral-filter-options \{[\s\S]*?border-radius: 6px;[\s\S]*?padding: 8px;[\s\S]*?box-shadow: 0 4px 18px rgba\(47, 43, 61, 0\.16\);/);
  assert.match(extensionStylesSource, /\.referral-cv-status-filter \.referral-filter-options button\.is-selected \{[\s\S]*?color: #3B82F6;[\s\S]*?background: #DBEAFE;[\s\S]*?border-radius: 6px;/);
});
