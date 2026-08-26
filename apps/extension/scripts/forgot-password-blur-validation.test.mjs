import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(
  new URL('../src/features/auth/ForgotPasswordForm.tsx', import.meta.url),
  'utf8',
);

test('forgot-password identifier shows and focuses the required error on blur', () => {
  const handler = source.match(/function handleIdentifierBlur\(event: FocusEvent<HTMLInputElement>\) \{([\s\S]*?)\n  \}/)?.[1] ?? '';

  assert.match(handler, /!login\.trim\(\)/);
  assert.match(handler, /Tên đăng nhập là bắt buộc/);
  assert.match(handler, /setIdentifierError/);
  assert.match(handler, /loginInputRef\.current\?\.focus\(\)/);
  assert.match(source, /onBlur=\{handleIdentifierBlur\}/);
  assert.match(source, /errorMessage=\{identifierError\}/);
});

test('forgot-password back action bypasses identifier blur validation', () => {
  assert.match(source, /skipIdentifierBlurValidationRef = useRef\(false\)/);
  assert.match(source, /onMouseDown=\{\(\) => \{ skipIdentifierBlurValidationRef\.current = true; \}\}/);
  assert.match(source, /setIdentifierError\(null\);\s*setError\(null\);\s*onCancel\(\);/);
});
