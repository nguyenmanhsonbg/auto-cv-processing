import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const loginFormPath = fileURLToPath(new URL('../src/features/auth/LoginForm.tsx', import.meta.url));

function handlerBody(source, handlerName) {
  const handlerStart = source.indexOf(`const ${handlerName} = () => {`);
  assert.notEqual(handlerStart, -1, `${handlerName} handler should exist`);
  const bodyStart = source.indexOf('{', handlerStart);
  const bodyEnd = source.indexOf('\n  };', bodyStart);
  assert.notEqual(bodyEnd, -1, `${handlerName} handler should have a body`);
  return source.slice(bodyStart, bodyEnd);
}

test('login blur handlers keep required errors without forcing focus back', async () => {
  const source = await readFile(loginFormPath, 'utf8');
  const loginBlur = handlerBody(source, 'handleLoginBlur');
  const passwordBlur = handlerBody(source, 'handlePasswordBlur');

  assert.match(loginBlur, /setBlurErrors/);
  assert.match(loginBlur, /login\.trim\(\) \? null : 'Tên đăng nhập là bắt buộc'/);
  assert.doesNotMatch(loginBlur, /\.focus\(\)/);

  assert.match(passwordBlur, /setBlurErrors/);
  assert.match(passwordBlur, /password \? null : 'Mật khẩu là bắt buộc'/);
  assert.doesNotMatch(passwordBlur, /\.focus\(\)/);
});
