import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(
  new URL('../src/features/auth/ForgotPasswordForm.tsx', import.meta.url),
  'utf8',
);

test('leaving the OTP step clears the previously entered code', () => {
  const otpBackAction = source.match(
    /<button type="button" className="secondary-button" onClick=\{\(\) => \{[^}]*setStep\('METHOD'\)[^}]*\}\}>Quay lại<\/button>/,
  );

  assert.ok(otpBackAction, 'OTP back action should be present');
  assert.match(otpBackAction[0], /setOtp\(''\)/);
});

test('requesting a new recovery code starts with an empty OTP', () => {
  const confirmMethodStart = source.indexOf('async function confirmMethod()');
  const confirmMethodEnd = source.indexOf('\n  async function confirmOtp()', confirmMethodStart);
  const confirmMethodSource = source.slice(confirmMethodStart, confirmMethodEnd);

  assert.ok(confirmMethodStart >= 0, 'method confirmation handler should exist');
  assert.ok(confirmMethodEnd > confirmMethodStart, 'method confirmation handler should be bounded');
  assert.match(confirmMethodSource, /setOtp\(''\)/);
});
