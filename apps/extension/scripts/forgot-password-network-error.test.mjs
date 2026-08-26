import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const forgotPasswordSource = await readFile(
  new URL('../src/features/auth/ForgotPasswordForm.tsx', import.meta.url),
  'utf8',
);
const loginSource = await readFile(
  new URL('../src/features/auth/LoginForm.tsx', import.meta.url),
  'utf8',
);

test('forgot-password network failures are routed to the extension toast', () => {
  assert.match(forgotPasswordSource, /onError\?: \(message: string\) => void/);
  assert.match(forgotPasswordSource, /Có lỗi kết nối mạng, vui lòng kiểm tra lại\./);
  assert.match(forgotPasswordSource, /code === 'NETWORK_ERROR'/);
  assert.match(forgotPasswordSource, /onError\(NETWORK_ERROR_MESSAGE\)/);
  assert.doesNotMatch(forgotPasswordSource, /Network Error/);
});

test('login passes its existing toast callback into forgot-password flow', () => {
  assert.match(loginSource, /<ForgotPasswordForm[\s\S]*onCancel=\{\(\) => setForgotPasswordMode\(false\)\}[\s\S]*onError=\{onError\}/);
});

test('reset-password submit uses the same network toast path', () => {
  assert.match(forgotPasswordSource, /async function completeReset[\s\S]*handleRequestError\(err, 'Không thể đổi mật khẩu\. Vui lòng thử lại\.'\)/);
  assert.match(forgotPasswordSource, /<ChangePasswordForm error=\{error\}[\s\S]*isResetPassword/);
});
