import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const componentSource = await readFile(
  new URL('../src/features/freelancer/freelancer-cv-panel.tsx', import.meta.url),
  'utf8',
);
const stylesSource = await readFile(
  new URL('../src/app/styles.css', import.meta.url),
  'utf8',
);

test('CV note textarea reserves three lines and scrolls only after the third line', () => {
  const noteTextareaRules = [...stylesSource.matchAll(/(?:^|\r?\n)\.freelancer-cv-note textarea\s*\{[\s\S]*?\r?\n}\r?\n/g)];
  const noteTextarea = noteTextareaRules.at(-1);

  assert.ok(noteTextarea, 'CV note textarea CSS should exist');
  assert.match(componentSource, /<textarea[\s\S]*?rows=\{3\}[\s\S]*?\/>/);
  assert.match(noteTextarea[0], /height:\s*80px/);
  assert.match(noteTextarea[0], /min-height:\s*80px/);
  assert.match(noteTextarea[0], /max-height:\s*80px/);
  assert.match(noteTextarea[0], /line-height:\s*20px/);
  assert.match(noteTextarea[0], /overflow-y:\s*auto/);
  assert.match(noteTextarea[0], /resize:\s*none/);
});
