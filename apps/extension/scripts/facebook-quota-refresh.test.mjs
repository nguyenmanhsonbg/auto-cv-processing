import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const managerSource = await readFile(
  new URL('../src/features/facebook/use-facebook-manager.ts', import.meta.url),
  'utf8',
);

test('refreshes Facebook group quotas after an accepted publish result', () => {
  const refreshStart = managerSource.indexOf('const refreshFacebookGroupsAfterPublish = useCallback');
  const executeStart = managerSource.indexOf('const executeFacebookPublish = useCallback');
  const configStart = managerSource.indexOf('const facebookConfig = useMemo', executeStart);

  assert.ok(refreshStart >= 0, 'post-publish Facebook group refresh should exist');
  assert.ok(executeStart > refreshStart, 'the refresh helper should be defined before publish execution');
  assert.ok(configStart > executeStart, 'executeFacebookPublish should have a bounded source section');

  const executeSource = managerSource.slice(executeStart, configStart);
  assert.match(
    executeSource,
    /if \(summary\.successCount > 0\) \{[\s\S]*?await refreshFacebookGroupsAfterPublish\(\);/,
    'accepted publish results should trigger a quota refresh',
  );
});

test('post-publish quota refresh reads current groups and preserves publish success on refresh failure', () => {
  const refreshStart = managerSource.indexOf('const refreshFacebookGroupsAfterPublish = useCallback');
  const refreshEnd = managerSource.indexOf('const executeFacebookPublish = useCallback', refreshStart);
  const refreshSource = managerSource.slice(refreshStart, refreshEnd);

  assert.match(refreshSource, /getFacebookGroups\(accessToken, accountId\)/);
  assert.match(refreshSource, /setFacebookGroups\(groups\)/);
  assert.match(refreshSource, /buildFacebookGroupSelectionMessage/);
  assert.match(refreshSource, /catch \(error\) \{[\s\S]*?console\.warn/);
});
