import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const styles = await readFile(resolve(scriptDirectory, '../src/styles.css'), 'utf8');

assert.match(
  styles,
  /\.extension-tabs\s*\{[\s\S]*?overflow-x:\s*auto;/,
  'extension tabs should scroll horizontally instead of clipping narrow content',
);
assert.match(
  styles,
  /\.extension-tabs\s*\{[\s\S]*?grid-template-columns:\s*repeat\(4,\s*minmax\(max-content,\s*1fr\)\);/,
  'extension tabs should preserve four intrinsic-width columns',
);
assert.match(
  styles,
  /\.extension-tab\s*\{[\s\S]*?line-height:\s*1\.25;/,
  'extension tab text should have enough line height for Vietnamese diacritics',
);
assert.match(
  styles,
  /\.extension-tab span\s*\{[\s\S]*?min-width:\s*max-content;[\s\S]*?overflow:\s*visible;[\s\S]*?text-overflow:\s*clip;/,
  'extension tab labels should not be truncated',
);

console.log('tab-label-visibility: passed');
