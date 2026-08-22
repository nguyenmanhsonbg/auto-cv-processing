import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const component = await readFile(
  new URL('../src/features/referrals/referral-management.tsx', import.meta.url),
  'utf8',
);

test('referral management exposes account status options and sends the selected status to the API', () => {
  assert.match(component, /type AccountStatusFilter = 'ALL' \| 'ACTIVE' \| 'INACTIVE';/);
  assert.match(component, /label="Tình trạng tài khoản"/);
  assert.match(component, /\{ value: 'ALL', label: 'Tất cả' \}/);
  assert.match(component, /\{ value: 'ACTIVE', label: 'Hoạt động' \}/);
  assert.match(component, /\{ value: 'INACTIVE', label: 'Đã khóa' \}/);
  assert.match(component, /status: accountStatusFilter === 'ALL' \? undefined : accountStatusFilter/);
});
