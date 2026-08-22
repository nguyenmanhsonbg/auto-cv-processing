import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sidePanelSource = readFileSync(new URL('./side-panel.tsx', import.meta.url), 'utf8');

test('passes the recruitment-round loader to the Internal referral panel', () => {
  const internalPanelBlock = sidePanelSource.match(
    /\{tab === 'internal' && token \? \(\s*(<ReferralManagementPanel[\s\S]*?\/>)[\s\S]*?\) : null\}/,
  )?.[1];

  assert.ok(internalPanelBlock, 'Internal referral panel should be rendered by side-panel');
  assert.match(internalPanelBlock, /source="INTERNAL"/);
  assert.match(internalPanelBlock, /loadRecruitmentRounds=\{loadReferralRecruitmentRounds\}/);
});
