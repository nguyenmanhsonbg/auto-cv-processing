import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(
  new URL('../src/features/auth/LoginForm.tsx', import.meta.url),
  'utf8',
);

test('internal password form validates empty full name on blur without trapping focus', () => {
  const handler = source.match(/const handleInternalFullNameBlur = \(\) => \{([\s\S]*?)\n  \};/)?.[1] ?? '';

  assert.match(handler, /!internalFullName\.trim\(\)/);
  assert.match(handler, /Họ tên nhân sự là bắt buộc/);
  assert.match(handler, /setInternalFieldErrors/);
  assert.match(handler, /fullName: 'Họ tên nhân sự là bắt buộc'/);
  assert.doesNotMatch(handler, /internalFullNameRef\.current\?\.focus\(\)/);
});

test('internal password form validates empty Gmail on blur without trapping focus', () => {
  const handler = source.match(/const handleInternalEmailBlur = \(\) => \{([\s\S]*?)\n  \};/)?.[1] ?? '';

  assert.match(handler, /const normalizedEmail = internalEmail\.trim\(\)/);
  assert.match(handler, /!normalizedEmail/);
  assert.match(handler, /Gmail nội bộ nhân sự là bắt buộc/);
  assert.match(handler, /setInternalFieldErrors/);
  assert.match(handler, /email: 'Gmail nội bộ nhân sự là bắt buộc'/);
  assert.doesNotMatch(handler, /internalEmailRef\.current\?\.focus\(\)/);
});

test('internal password submit still focuses the first invalid field', () => {
  const handler = source.match(/const handleInternalSubmit:[\s\S]*?\n  \};/)?.[0] ?? '';

  assert.match(handler, /setInternalFieldErrors\(\{ fullName: fullNameError, email: emailError \}\)/);
  assert.match(handler, /if \(fullNameError\)/);
  assert.match(handler, /internalFullNameRef\.current\?\.focus\(\)/);
  assert.match(handler, /if \(emailError\)/);
  assert.match(handler, /internalEmailRef\.current\?\.focus\(\)/);
});

test('internal password confirmation is disabled when validation errors are visible', () => {
  assert.match(
    source,
    /disabled=\{[\s\S]*Boolean\(fullNameError \|\| emailError\)[\s\S]*!fullName\.trim\(\) && !email\.trim\(\)/,
  );
  assert.match(source, /Gmail nội bộ nhân sự là bắt buộc/);
});

test('internal password form keeps full name and email errors independently', () => {
  assert.match(source, /const \[internalFieldErrors, setInternalFieldErrors\] = useState/);
  assert.match(source, /\.\.\.current, fullName: null/);
  assert.match(source, /\.\.\.current, email: null/);
  assert.match(source, /fullNameError=\{internalFieldErrors\.fullName\}/);
  assert.match(source, /emailError=\{internalFieldErrors\.email\}/);
});
