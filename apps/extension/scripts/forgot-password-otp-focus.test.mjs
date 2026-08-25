import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(
  new URL('../src/features/auth/ForgotPasswordForm.tsx', import.meta.url),
  'utf8',
);

test('OTP input advances focus to the next digit after a valid number', () => {
  const onChangeStart = source.indexOf('onChange={(event) => {', source.indexOf('extension-otp-input'));
  const onChangeEnd = source.indexOf('\n                }}', onChangeStart);
  const onChangeSource = source.slice(onChangeStart, onChangeEnd);

  assert.ok(onChangeStart >= 0, 'OTP onChange handler should exist');
  assert.ok(onChangeEnd > onChangeStart, 'OTP onChange handler should be bounded');
  assert.match(onChangeSource, /if \(digit && index < 5\) otpInputRefs\.current\[index \+ 1\]\?\.focus\(\);/);
});

test('OTP input keeps backward navigation and paste focus behavior', () => {
  const otpSource = source.slice(source.indexOf('extension-otp-input'));

  assert.match(otpSource, /event\.key === 'Backspace'/);
  assert.match(otpSource, /otpInputRefs\.current\[index - 1\]\?\.focus\(\)/);
  assert.match(otpSource, /event\.clipboardData\.getData\('text'\)/);
  assert.match(otpSource, /otpInputRefs\.current\[Math\.min\(pasted\.length, 6\) - 1\]\?\.focus\(\)/);
});
