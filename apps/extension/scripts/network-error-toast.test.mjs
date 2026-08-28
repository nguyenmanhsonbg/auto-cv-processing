import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NETWORK_ERROR_TOAST_MESSAGE,
  isNetworkUnavailableError,
  isNetworkUnavailableStatus,
} from '../src/lib/network-error-toast.ts';

test('uses the requested network error toast message', () => {
  assert.equal(NETWORK_ERROR_TOAST_MESSAGE, 'Có lỗi kết nối mạng, vui lòng kiểm tra lại.');
});

test('recognizes transport errors and unavailable gateway responses', () => {
  assert.equal(isNetworkUnavailableError({ code: 'NETWORK_ERROR', status: 0 }), true);
  assert.equal(isNetworkUnavailableError(new TypeError('Failed to fetch')), true);
  assert.equal(isNetworkUnavailableStatus(502), true);
  assert.equal(isNetworkUnavailableStatus(503), true);
  assert.equal(isNetworkUnavailableStatus(504), true);
});

test('does not convert ordinary API errors into network errors', () => {
  assert.equal(isNetworkUnavailableError({ code: 'VALIDATION_ERROR', status: 400 }), false);
  assert.equal(isNetworkUnavailableError({ code: 'HTTP_500', status: 500 }), false);
  assert.equal(isNetworkUnavailableStatus(400), false);
  assert.equal(isNetworkUnavailableStatus(500), false);
});
