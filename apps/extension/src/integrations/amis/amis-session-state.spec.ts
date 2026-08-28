import test from 'node:test';
import assert from 'node:assert/strict';
import { isAuthenticatedAmisSessionState } from './amis-session-state';

test('accepts an authenticated AMIS session response', () => {
  assert.equal(
    isAuthenticatedAmisSessionState({
      ok: true,
      authenticated: true,
      sourceUrl: 'https://amisapp.misa.vn/recruit/job/detail/44474',
    }),
    true,
  );
});

test('rejects an unauthenticated or malformed AMIS session response', () => {
  assert.equal(
    isAuthenticatedAmisSessionState({
      ok: true,
      authenticated: false,
      sourceUrl: 'https://amisapp.misa.vn/',
    }),
    false,
  );
  assert.equal(
    isAuthenticatedAmisSessionState({ ok: true, authenticated: true }),
    false,
  );
});
