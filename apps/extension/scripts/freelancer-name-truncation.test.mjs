import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const componentSource = await readFile(
  new URL('../src/features/referrals/components/ReferralPersonCard.tsx', import.meta.url),
  'utf8',
);
const freelancerCvPanelSource = await readFile(
  new URL('../src/features/freelancer/freelancer-cv-panel.tsx', import.meta.url),
  'utf8',
);
const stylesSource = await readFile(
  new URL('../src/app/styles.css', import.meta.url),
  'utf8',
);

test('freelancer name keeps the full value in a tooltip', () => {
  assert.match(
    componentSource,
    /<h3 title=\{person\.name \|\| undefined\}>\{person\.name \|\| null\}<\/h3>/,
  );
});

test('freelancer name is constrained to 24 characters and ellipsized', () => {
  const nameRow = stylesSource.match(/\.referral-person-name-row \{[\s\S]*?\r?\n}\r?\n/);
  const nameStyle = stylesSource.match(/\.referral-person-identity h3 \{[\s\S]*?\r?\n}\r?\n/);

  assert.ok(nameRow, 'freelancer name row CSS should exist');
  assert.ok(nameStyle, 'freelancer name CSS should exist');
  assert.match(nameRow[0], /width:\s*100%/);
  assert.match(nameStyle[0], /flex:\s*0 1 150px/);
  assert.match(nameStyle[0], /width:\s*150px/);
  assert.match(nameStyle[0], /max-width:\s*min\(150px,\s*24ch\)/);
  assert.match(nameStyle[0], /text-overflow:\s*ellipsis/);
});

test('locked Freelancer cards keep the design colors instead of fading the whole card', () => {
  const inactiveCardStyle = stylesSource.match(/\.referral-person-card\.is-inactive \{[\s\S]*?\r?\n}\r?\n/);

  assert.ok(inactiveCardStyle, 'inactive Freelancer card CSS should exist');
  assert.match(inactiveCardStyle[0], /opacity:\s*1/);
});

test('freelancer actions stay fixed beside a long name', () => {
  const identity = stylesSource.match(/\.referral-person-identity \{[\s\S]*?\r?\n}\r?\n/);
  const actions = stylesSource.match(/\.referral-person-actions \{[\s\S]*?\r?\n}\r?\n/);

  assert.ok(identity, 'freelancer identity CSS should exist');
  assert.ok(actions, 'freelancer actions CSS should exist');
  assert.match(identity[0], /flex:\s*1 1 auto/);
  assert.match(identity[0], /min-width:\s*0/);
  assert.match(actions[0], /flex:\s*0 0 auto/);
});

test('Freelancer CV card exposes the full candidate name for a truncated name', () => {
  assert.match(
    freelancerCvPanelSource,
    /<h3 className="freelancer-cv-candidate-name" title=\{application\.candidate\.fullName\}>[\s\S]*\{application\.candidate\.fullName\}[\s\S]*<\/h3>/,
  );
});

test('Freelancer CV card ellipsizes long names and keeps the avatar circular', () => {
  const nameStyle = stylesSource.match(/\.freelancer-cv-candidate-name \{[\s\S]*?\r?\n}\r?\n/);
  const avatarStyle = stylesSource.match(/\.freelancer-cv-card-heading \.cv-avatar \{[\s\S]*?\r?\n}\r?\n/);

  assert.ok(nameStyle, 'Freelancer candidate name CSS should exist');
  assert.ok(avatarStyle, 'Freelancer CV avatar CSS should exist');
  assert.match(nameStyle[0], /overflow:\s*hidden/);
  assert.match(nameStyle[0], /text-overflow:\s*ellipsis/);
  assert.match(nameStyle[0], /white-space:\s*nowrap/);
  assert.match(avatarStyle[0], /border-radius:\s*50%/);
});
