import assert from 'node:assert/strict';
import test from 'node:test';
import { FACEBOOK_HISTORY_REFRESH_SUCCESS_TOAST } from './facebook-history-refresh-message.ts';

test('uses the shared success toast after refreshing Facebook post history', () => {
  assert.equal(
    FACEBOOK_HISTORY_REFRESH_SUCCESS_TOAST.kind,
    'SUCCESS',
  );
  assert.equal(
    FACEBOOK_HISTORY_REFRESH_SUCCESS_TOAST.title,
    'Thành công',
  );
  assert.equal(
    FACEBOOK_HISTORY_REFRESH_SUCCESS_TOAST.message,
    'Đã tải lại lịch sử đăng bài thành công.',
  );
});
