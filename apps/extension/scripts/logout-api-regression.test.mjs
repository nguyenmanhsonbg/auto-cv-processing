import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sidePanelSource = await readFile(new URL('../src/app/side-panel.tsx', import.meta.url), 'utf8');
const apiClientSource = await readFile(new URL('../src/lib/api-client.ts', import.meta.url), 'utf8');

test('extension logout revokes the stored refresh token before clearing local auth state', () => {
  assert.match(apiClientSource, /export async function logoutAuthSession\(refreshToken\?: string \| null\)/);
  assert.match(apiClientSource, /request<\{ message: string \}>\('\/auth\/logout'/);
  assert.match(sidePanelSource, /const refreshToken = await getRefreshToken\(\);/);
  assert.match(sidePanelSource, /await logoutAuthSession\(refreshToken\);/);
  assert.match(sidePanelSource, /finally \{[\s\S]*await clearAccessToken\(\);/);
});
