import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(
  new URL('../src/features/facebook/use-facebook-manager.ts', import.meta.url),
  'utf8',
);

test('editing a Facebook group reports success through the shared toast', () => {
  assert.match(
    source,
    /if \(editingGroup\?\.targetId\) \{[\s\S]*?setFacebookSettingsState\('READY'\);[\s\S]*?setFacebookSettingsMessage\(null\);[\s\S]*?showToast\('SUCCESS', 'Thành công', 'Đã sửa nhóm thành công\.'\);/,
  );
  assert.doesNotMatch(source, /setFacebookSettingsMessage\(`Saved \"\$\{savedGroup\.targetName\}\./);
});
