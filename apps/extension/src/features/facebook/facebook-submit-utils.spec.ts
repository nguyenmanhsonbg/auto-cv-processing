import assert from 'node:assert/strict';
import test from 'node:test';
import { selectFacebookComposerSubmitCandidate } from './facebook-submit-utils.ts';

type Candidate = Parameters<typeof selectFacebookComposerSubmitCandidate>[0][number];

function candidate(overrides: Partial<Candidate>): Candidate {
  return {
    id: 'candidate',
    dialogVisible: true,
    dialogLabel: 'Tạo bài viết',
    hasEditor: true,
    buttonText: 'Đăng',
    ariaLabel: null,
    buttonVisible: true,
    buttonDisabled: false,
    insideCommentSurface: false,
    ...overrides,
  };
}

test('selects the enabled Đăng button inside the visible Tạo bài viết dialog', () => {
  const result = selectFacebookComposerSubmitCandidate([
    candidate({
      id: 'hidden-picker-button',
      dialogVisible: false,
      dialogLabel: 'Thêm nhóm',
      hasEditor: false,
      buttonVisible: false,
    }),
    candidate({ id: 'composer-submit' }),
  ]);

  assert.equal(result?.id, 'composer-submit');
});

test('does not select a comment submit button as the post submit button', () => {
  const result = selectFacebookComposerSubmitCandidate([
    candidate({
      id: 'comment-send',
      dialogLabel: 'Bình luận',
      hasEditor: false,
      insideCommentSurface: true,
    }),
  ]);

  assert.equal(result, null);
});

test('rejects a mounted composer button that is still disabled', () => {
  const result = selectFacebookComposerSubmitCandidate([
    candidate({ id: 'disabled-submit', buttonDisabled: true }),
  ]);

  assert.equal(result, null);
});
