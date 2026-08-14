import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));

test('extension tab styles preserve readable layout', async () => {
  const styles = await readFile(
    resolve(scriptDirectory, '../src/app/styles.css'),
    'utf8',
  );

  assert.match(
    styles,
    /\.extension-tabs\s*\{[\s\S]*?overflow-x:\s*auto;/,
  );

  assert.match(
    styles,
    /\.extension-tabs\s*\{[\s\S]*?grid-template-columns:\s*repeat\(4,\s*minmax\(max-content,\s*1fr\)\);/,
  );

  assert.match(
    styles,
    /\.extension-tab\s*\{[\s\S]*?line-height:\s*1\.25;/,
  );

  assert.match(
    styles,
    /\.extension-tab span\s*\{[\s\S]*?min-width:\s*max-content;[\s\S]*?overflow:\s*visible;[\s\S]*?text-overflow:\s*clip;/,
  );
});