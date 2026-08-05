import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../src/amis-bridge.ts', import.meta.url), 'utf8');

test('source dropdown filter does not bubble a form change event', () => {
  const filterFunction = source.match(/function typeIntoAmisDropdownFilter\([\s\S]*?\n\}/)?.[0] ?? '';
  assert.match(filterFunction, /dispatchEvent\(new InputEvent\('input'/);
  assert.doesNotMatch(filterFunction, /dispatchEvent\(new Event\('change'/);
});
