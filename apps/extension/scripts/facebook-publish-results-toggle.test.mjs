import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const sidePanelSource = await readFile(new URL('../src/side-panel.tsx', import.meta.url), 'utf8');
const stylesSource = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');

test('result toggle icons use the same 16px SVG coordinate system', () => {
  const downIcon = sidePanelSource.match(/function ChevronDownIcon\(\)[\s\S]*?\r?\n}\r?\n/);
  const upIcon = sidePanelSource.match(/function ChevronUpIcon\(\)[\s\S]*?\r?\n}\r?\n/);

  assert.ok(downIcon, 'ChevronDownIcon should exist');
  assert.ok(upIcon, 'ChevronUpIcon should exist');
  assert.match(downIcon[0], /viewBox="0 0 16 16"/);
  assert.match(upIcon[0], /viewBox="0 0 16 16"/);
  assert.doesNotMatch(upIcon[0], /viewBox="0 0 24 24"/);
});

test('result toggle shows the requested action direction', () => {
  assert.match(sidePanelSource, /\{isFacebookResultsExpanded \? <ChevronDownIcon \/> : <ChevronUpIcon \/>\}/);
  assert.match(sidePanelSource, /\{isExpanded \? <ChevronDownIcon \/> : <ChevronUpIcon \/>\}/);
});

test('result toggle has a stable button box and distinct hover state', () => {
  const toggleCss = stylesSource.match(/\.facebook-publish-results-toggle \{[\s\S]*?\r?\n}\r?\n/);
  const hoverCss = stylesSource.match(/\.facebook-publish-results-toggle:hover \{[\s\S]*?\r?\n}\r?\n/);

  assert.ok(toggleCss, 'result toggle CSS should exist');
  assert.ok(hoverCss, 'result toggle hover CSS should exist');
  assert.match(toggleCss[0], /border:\s*1px solid transparent/);
  assert.match(toggleCss[0], /padding:\s*0/);
  assert.match(toggleCss[0], /line-height:\s*0/);
  assert.match(hoverCss[0], /border-color:\s*#a7f3d0/);
  assert.match(hoverCss[0], /background:\s*#ecfdf5/);
});
