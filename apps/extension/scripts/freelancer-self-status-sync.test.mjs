import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const typesSource = await readFile(
  new URL('../src/types/types.ts', import.meta.url),
  'utf8',
);
const panelSource = await readFile(
  new URL('../src/features/freelancer/freelancer-cv-panel.tsx', import.meta.url),
  'utf8',
);
const controllerSource = await readFile(
  new URL('../../backend/src/freelancers/freelancers.controller.ts', import.meta.url),
  'utf8',
);

test('Freelancer self-service carries the same AMIS status fields as HR', () => {
  assert.match(typesSource, /export interface FreelancerSelfApplication[\s\S]*statusCategory/);
  assert.match(typesSource, /export interface FreelancerSelfApplication[\s\S]*currentAmisStage/);
  assert.match(panelSource, /application\.statusCategory/);
  assert.match(panelSource, /application\.currentAmisStage\?\.recruitmentRoundName/);
  assert.match(controllerSource, /statusCategory:\s*data\.statusCategory/);
  assert.match(controllerSource, /currentAmisStage:/);
});

test('Freelancer self-service exposes the AMIS attractive personnel name', () => {
  assert.match(typesSource, /export interface FreelancerSelfApplication[\s\S]*attractivePersonnelName/);
  assert.match(controllerSource, /attractivePersonnelName:\s*data\.attractivePersonnelName/);
});

test('Freelancer pass rate uses the same whole-percent rounding as HR', () => {
  assert.match(panelSource, /passRate:\s*total \? Math\.round\(\(passed \/ total\) \* 100\) : 0/);
});

test('TA phụ trách prefers AMIS personnel and keeps the existing fallbacks', () => {
  assert.match(panelSource, /attractivePersonnelName\?\.trim\(\)/);
  assert.match(panelSource, /assignees\[0\]\?\.name/);
  assert.match(panelSource, /Chưa phân công/);
});
