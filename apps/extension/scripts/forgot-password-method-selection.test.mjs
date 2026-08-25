import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(
  new URL('../src/features/auth/ForgotPasswordForm.tsx', import.meta.url),
  'utf8',
);

test('accounts with multiple recovery methods open the method selection step', () => {
  assert.match(source, /availableMethods/);
  assert.match(source, /const recoveryMethods = result\.availableMethods/);
  assert.match(source, /if \(recoveryMethods\.length > 1\)/);
  assert.match(source, /setStep\('METHOD'\)/);
});

test('phone recovery remains intentionally unavailable while email keeps the existing flow', () => {
  assert.match(source, /Phương thức này đang phát triển, thử lại sau/);
  assert.match(source, /if \(method === 'PHONE'\)/);
  assert.match(source, /requestPasswordReset\(login\.trim\(\)\)/);
});
