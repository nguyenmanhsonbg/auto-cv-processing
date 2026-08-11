import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const { isEmailAddress } = await import('../../../packages/shared/src/email-validation.ts');
const sidePanelSource = await readFile(new URL('../src/app/side-panel.tsx', import.meta.url), 'utf8');
const forgotPasswordSource = await readFile(new URL('../src/features/auth/ForgotPasswordForm.tsx', import.meta.url), 'utf8');
const facebookOrchestratorSource = await readFile(
  new URL('../src/features/facebook/facebook-publish-orchestrator.ts', import.meta.url),
  'utf8',
);
const frontendSource = await readFile(
  new URL('../../frontend/src/pages/interviewer/candidates/InternalListPage.tsx', import.meta.url),
  'utf8',
);

test('shared email validation preserves valid input and rejects unsafe control characters', () => {
  assert.equal(isEmailAddress('User.Name@VIETTEL.COM.VN'), true);
  assert.equal(isEmailAddress('user@viettel.vn'), true);
  assert.equal(isEmailAddress('user@viettel'), false);
  assert.equal(isEmailAddress('user\u0000@viettel.com.vn'), false);
});

test('email call sites do not retain the backtracking-prone email regex', () => {
  assert.equal(sidePanelSource.includes('/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/i.test(normalizedEmail)'), false);
  assert.equal(frontendSource.includes('const INTERNAL_EMAIL_PATTERN = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/i;'), false);
  assert.match(sidePanelSource, /isEmailAddress\(normalizedEmail\)/);
  assert.match(frontendSource, /isEmailAddress\(email\)/);
});

test('Facebook injected login probe removes trailing slashes without a backtracking regex', () => {
  assert.equal(
    facebookOrchestratorSource.includes("parsed.pathname.replace(/\\/+$/, '').toLowerCase()"),
    false,
  );
  assert.match(
    facebookOrchestratorSource,
    /let normalizedPath = parsed\.pathname\.toLowerCase\(\);\s*while \(normalizedPath\.endsWith\('\/'\)\)/,
  );
});

test('password recovery radio inputs have explicit accessible names', () => {
  const radioInputs = [...forgotPasswordSource.matchAll(/<input[\s\S]*?type="radio"[\s\S]*?\/>/g)]
    .map(([input]) => input);
  assert.equal(radioInputs.length, 2);
  assert.equal(radioInputs.filter((input) => input.includes('aria-label=')).length, 2);
  assert.match(forgotPasswordSource, /<label[^>]*htmlFor="forgot-method-phone"/);
  assert.match(forgotPasswordSource, /<input id="forgot-method-phone" type="radio"/);
  assert.match(forgotPasswordSource, /<label[^>]*htmlFor="forgot-method-email"/);
  assert.match(forgotPasswordSource, /<input id="forgot-method-email" type="radio"/);
});
