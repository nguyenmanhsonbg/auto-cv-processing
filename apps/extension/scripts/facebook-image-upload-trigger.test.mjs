import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const managerSource = await readFile(
  new URL('../src/features/facebook/use-facebook-manager.ts', import.meta.url),
  'utf8',
);
const panelSource = await readFile(
  new URL('../src/features/posting/JobPostingPanel.tsx', import.meta.url),
  'utf8',
);

test('Facebook image picker exposes the manager ref to the posting panel input', () => {
  assert.match(managerSource, /facebookImageInputRef,\s*\n\s*facebookImageAttachments,/);
  assert.match(panelSource, /facebookImageInputRef,/);
  assert.match(panelSource, /onHandleFacebookImageFileChange,/);
  assert.doesNotMatch(panelSource, /const facebookImageInputRef = useRef<HTMLInputElement \| null>\(null\);/);
  assert.match(panelSource, /ref=\{facebookImageInputRef as any\}/);
});

test('Facebook image picker click uses the shared input ref', () => {
  assert.match(
    managerSource,
    /onOpenImageFilePicker: \(\) => \{[\s\S]*?facebookImageInputRef\.current\?\.click\(\);[\s\S]*?\n\s*\},/,
  );
});

test('Facebook image picker accepts and processes a Ctrl-click multi-selection', () => {
  assert.match(panelSource, /multiple/);
  assert.match(managerSource, /Array\.from\(event\.target\.files \?\? \[\]\)/);
  assert.match(managerSource, /Promise\.all\(files\.map/);
});
