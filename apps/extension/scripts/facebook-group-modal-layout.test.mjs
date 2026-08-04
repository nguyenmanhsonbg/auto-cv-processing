import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const stylesSource = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');

test('Facebook group modal toolbar can wrap without horizontal overflow', () => {
  const toolbarCss = stylesSource.match(/\.facebook-group-settings-modal \.modal-toolbar \{[\s\S]*?\r?\n}\r?\n/);

  assert.ok(toolbarCss, 'settings modal toolbar CSS should exist');
  assert.match(toolbarCss[0], /flex-wrap:\s*wrap/);
  assert.match(stylesSource, /\.facebook-group-settings-modal \.modal-toolbar[\s\S]*?min-width:\s*0/);
});

test('Facebook group actions fit inside the group card', () => {
  const actionsCss = stylesSource.match(/\.facebook-group-modal \.facebook-group-item-actions \{[\s\S]*?\r?\n}\r?\n/);

  assert.ok(actionsCss, 'group actions CSS should exist');
  assert.match(actionsCss[0], /grid-template-columns:\s*minmax\(0,\s*1fr\) repeat\(3,\s*24px\)/);
  assert.match(actionsCss[0], /width:\s*100%/);
  assert.match(actionsCss[0], /min-width:\s*0/);
});

test('Facebook group settings shows all five records without a list scrollbar', () => {
  assert.match(
    stylesSource,
    /\.facebook-group-settings-modal \.facebook-group-list \{[\s\S]*?max-height:\s*none[\s\S]*?overflow-y:\s*visible/,
  );
});

test('Facebook group pagination wraps on narrow panels', () => {
  const paginationCss = stylesSource.match(/^\.facebook-group-pagination \{[\s\S]*?\r?\n}\r?\n/m);

  assert.ok(paginationCss, 'group pagination CSS should exist');
  assert.match(paginationCss[0], /flex-wrap:\s*wrap/);
});

test('Facebook group pagination keeps summary and controls on one row', () => {
  assert.match(stylesSource, /\.facebook-group-settings-modal \{[\s\S]*?width:\s*min\(100%,\s*520px\)/);
  assert.match(stylesSource, /\.facebook-group-settings-modal \.facebook-group-pagination \{[\s\S]*?flex-wrap:\s*nowrap/);
  assert.match(stylesSource, /\.facebook-group-settings-modal \.facebook-group-pagination > span \{[\s\S]*?font-size:\s*12px[\s\S]*?font-weight:\s*400/);
});
