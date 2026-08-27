import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toggleMultiSelectValue } from './MultiSelectFilter';

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
