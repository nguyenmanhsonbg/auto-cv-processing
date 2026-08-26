import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const referralManagementSource = await readFile(
  new URL('../src/features/referrals/referral-management.tsx', import.meta.url),
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
