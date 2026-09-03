import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getMultiSelectPlaceholder, toggleMultiSelectValue } from './MultiSelectFilter';

test('uses allLabel as the trigger text when no explicit placeholder is provided', () => {
  assert.equal(getMultiSelectPlaceholder(undefined, 'Tất cả JD'), 'Tất cả JD');
});

test('keeps the first JD selected when a second JD is selected', () => {
  assert.deepEqual(
    toggleMultiSelectValue(['jd-devops'], 'jd-frontend'),
    ['jd-devops', 'jd-frontend'],
  );
});

test('removes only the JD that was toggled off', () => {
  assert.deepEqual(
    toggleMultiSelectValue(['jd-devops', 'jd-frontend'], 'jd-devops'),
    ['jd-frontend'],
  );
});

test('selecting all JD clears the explicit selection', () => {
  assert.deepEqual(toggleMultiSelectValue(['jd-devops'], null), []);
});
