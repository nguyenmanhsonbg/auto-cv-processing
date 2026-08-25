import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const componentSource = await readFile(
  new URL('../src/features/posting/JobPostingPanel.tsx', import.meta.url),
  'utf8',
);

test('sync and publish button is disabled when no posting channel is selected', () => {
  const buttonStart = componentSource.indexOf('className="primary-button sync-button"');
  const buttonEnd = componentSource.indexOf('</button>', buttonStart);

  assert.ok(buttonStart >= 0, 'sync and publish button should exist');
  assert.ok(buttonEnd > buttonStart, 'sync and publish button should have a bounded body');

  const buttonSource = componentSource.slice(buttonStart, buttonEnd);
  assert.match(
    buttonSource,
    /disabled=\{syncDisabled\s*\|\|\s*selectedPostingChannels\.length\s*===\s*0\}/,
    'the button must be disabled until at least one posting channel is selected',
  );
});
