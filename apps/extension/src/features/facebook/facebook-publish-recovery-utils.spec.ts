import assert from 'node:assert/strict';
import test from 'node:test';
import {
  inferFacebookPostClickEvidence,
  shouldKeepFacebookPublishTabOpenForInspection,
  shouldAcceptFacebookSubmissionEvidence,
  shouldRecoverFacebookSubmittedPostUrl,
} from './facebook-publish-recovery-utils';

test('rechecks Facebook pending posts after a submit click even when the first probe failed', () => {
  assert.equal(
    shouldRecoverFacebookSubmittedPostUrl({ status: 'FAILED', submitClickDispatched: true }),
    true,
  );
});

test('does not recheck Facebook pending posts before a submit click was dispatched', () => {
  assert.equal(
    shouldRecoverFacebookSubmittedPostUrl({ status: 'FAILED', submitClickDispatched: false }),
    false,
  );
});

test('accepts trusted post-click evidence when Facebook returned a false-negative error', () => {
  assert.equal(
    shouldAcceptFacebookSubmissionEvidence({
      status: 'FAILED',
      message: 'Facebook returned a post submission error after the composer changed.',
      submitClickDispatched: true,
      postClickEvidence: true,
    }),
    true,
  );
});

test('does not accept trusted post-click evidence for a blocked submit', () => {
  assert.equal(
    shouldAcceptFacebookSubmissionEvidence({
      status: 'FAILED',
      message: 'FB_SUBMIT_BLOCKED_BY_DIALOG: Facebook submit appears blocked by a visible dialog.',
      submitClickDispatched: true,
      postClickEvidence: true,
    }),
    false,
  );
});

test('infers post-click evidence when the Facebook composer no longer exposes the submit button', () => {
  assert.equal(
    inferFacebookPostClickEvidence(
      { postClickEvidence: false },
      { submitButtonFound: false, ariaDisabled: null, clickPointStillSubmit: false },
    ),
    true,
  );
});

test('does not infer post-click evidence while the submit button remains enabled', () => {
  assert.equal(
    inferFacebookPostClickEvidence(
      { postClickEvidence: false },
      { submitButtonFound: true, ariaDisabled: 'false', clickPointStillSubmit: true },
    ),
    false,
  );
});

test('keeps a failed Facebook publish tab open for temporary diagnostics', () => {
  assert.equal(
    shouldKeepFacebookPublishTabOpenForInspection({ status: 'FAILED' }),
    true,
  );
});

test('does not keep successful or skipped Facebook publish tabs open', () => {
  assert.equal(
    shouldKeepFacebookPublishTabOpenForInspection({ status: 'SUCCESS' }),
    false,
  );
  assert.equal(
    shouldKeepFacebookPublishTabOpenForInspection({ status: 'SKIPPED' }),
    false,
  );
});
