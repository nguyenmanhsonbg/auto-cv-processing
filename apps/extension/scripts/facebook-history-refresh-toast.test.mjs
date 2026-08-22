import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const managerSource = await readFile(
  new URL('../src/features/facebook/use-facebook-manager.ts', import.meta.url),
  'utf8',
);

test('Facebook history refresh uses the shared success toast instead of an inline summary message', () => {
  assert.match(
    managerSource,
    /FACEBOOK_HISTORY_REFRESH_SUCCESS_TOAST/,
    'the history refresh should use the shared success toast copy',
  );
  assert.match(
    managerSource,
    /showToast\(\s*FACEBOOK_HISTORY_REFRESH_SUCCESS_TOAST\.kind,\s*FACEBOOK_HISTORY_REFRESH_SUCCESS_TOAST\.title,\s*FACEBOOK_HISTORY_REFRESH_SUCCESS_TOAST\.message,\s*\)/,
    'a successful history refresh should show the shared toast',
  );
  assert.doesNotMatch(
    managerSource,
    /setFacebookHistoryMessage\(\s*`Đã kiểm tra/, 
    'the completed refresh must not render the old inline summary message',
  );
});
