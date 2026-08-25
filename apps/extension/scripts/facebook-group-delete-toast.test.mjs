import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const managerSource = await readFile(
  new URL('../src/features/facebook/use-facebook-manager.ts', import.meta.url),
  'utf8',
);
const settingsModalSource = await readFile(
  new URL('../src/components/facebook/FacebookGroupSettingsModal.tsx', import.meta.url),
  'utf8',
);

test('successful Facebook group deletion closes the confirmation modal after the shared toast is shown', () => {
  assert.match(
    managerSource,
    /showToast\('SUCCESS', 'Thành công', 'Đã xóa nhóm thành công'\);[\s\S]*?return true;/,
  );
  assert.match(
    settingsModalSource,
    /onDeleteGroup: \(group: FacebookPublishTarget\) => Promise<boolean> \| boolean;/,
  );
  assert.match(
    settingsModalSource,
    /const deleted = await onDeleteGroup\(selectedGroup\);[\s\S]*?if \(deleted\) closeSubModal\(\);/,
  );
});

test('failed Facebook group deletion keeps the confirmation modal open', () => {
  assert.match(
    managerSource,
    /setFacebookSettingsState\('ERROR'\);[\s\S]*?setFacebookSettingsMessage\(toErrorMessage\(err\)\);[\s\S]*?return false;/,
  );
  assert.doesNotMatch(
    settingsModalSource,
    /onConfirm=\{\(\) => void onDeleteGroup\(selectedGroup\)\}/,
  );
});
