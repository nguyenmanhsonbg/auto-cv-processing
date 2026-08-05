import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const component = await readFile(new URL('../src/referral-management.tsx', import.meta.url), 'utf8');

test('referral management exposes account status options and sends the selected status to the API', () => {
  assert.match(component, /type AccountStatusFilter = 'ALL' \| 'ACTIVE' \| 'INACTIVE';/);
  assert.match(component, /<span>Tình trạng tài khoản<\/span>/);
  assert.match(component, /<option value="ALL">Tất cả<\/option>/);
  assert.match(component, /<option value="ACTIVE">Hoạt động<\/option>/);
  assert.match(component, /<option value="INACTIVE">Đã khóa<\/option>/);
  assert.match(component, /status: accountStatusFilter === 'ALL' \? undefined : accountStatusFilter/);
});
