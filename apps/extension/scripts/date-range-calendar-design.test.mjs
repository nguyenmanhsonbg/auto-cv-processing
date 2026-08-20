import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(
  new URL('../src/app/styles.css', import.meta.url),
  'utf8',
);

function rule(selector) {
  return source.match(new RegExp(`${selector}\\s*\\{[^}]*\\}`, 'm'))?.[0] ?? '';
}

test('date range calendar popup follows the design width and white surface', () => {
  const popup = rule('\\.shared-filter-date-range-popup');
  assert.match(popup, /left:\s*auto;/);
  assert.match(popup, /width:\s*min\(550px,\s*calc\(100vw - 24px\)\);/);
  assert.match(popup, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/);
  assert.match(popup, /column-gap:\s*20px;/);
  assert.match(popup, /background:\s*#fff;/);
});

test('date range calendar typography and selected day follow the design', () => {
  const monthHeading = rule('\\.shared-filter-calendar-month h3');
  const weekdays = rule('\\.shared-filter-calendar-weekdays');
  const calendarGrid = source.match(/\.shared-filter-calendar-weekdays,\s*\.shared-filter-calendar-days\s*\{[^}]*\}/)?.[0] ?? '';
  const days = source.match(/\.shared-filter-calendar-days\s*\{[^}]*row-gap:[^}]*\}/)?.[0] ?? '';
  const dayButton = rule('\\.shared-filter-calendar-days button,\\s*\\.shared-filter-calendar-days > span');
  const selectedDay = rule('\\.shared-filter-calendar-days button\\.is-selected');
  const nav = rule('\\.shared-filter-date-range-nav');

  assert.match(monthHeading, /color:\s*#000;/);
  assert.match(monthHeading, /font-size:\s*14px;/);
  assert.match(monthHeading, /font-weight:\s*500;/);
  assert.match(weekdays, /color:\s*#ef4444;/i);
  assert.match(weekdays, /font-size:\s*12px;/);
  assert.match(days, /font-size:\s*12px;/);
  assert.match(calendarGrid, /grid-template-columns:\s*repeat\(7,\s*minmax\(0,\s*1fr\)\);/);
  assert.match(dayButton, /width:\s*min\(30px,\s*100%\);/);
  assert.match(dayButton, /max-width:\s*100%;/);
  assert.match(dayButton, /height:\s*28px;/);
  assert.match(selectedDay, /background:\s*#ef4444;/i);
  assert.match(selectedDay, /border-radius:\s*8px;/);
  assert.match(nav, /position:\s*absolute;/);
});
