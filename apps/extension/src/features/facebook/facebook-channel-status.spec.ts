import assert from 'node:assert/strict';
import { test } from 'node:test';
import { summarizeFacebookPublishResults } from './facebook-channel-status';

test('Facebook pending review is counted as an accepted submission', () => {
  const summary = summarizeFacebookPublishResults([{
    jobPostingId: 'job-1',
    targetType: 'GROUP',
    targetName: 'Hội Nhóm FullStack Hà Nội',
    status: 'FAILED',
    facebookReviewStatus: 'PENDING_REVIEW',
    message: 'Facebook accepted the post and is waiting for admin approval.',
  }]);

  assert.equal(summary.successCount, 1);
  assert.equal(summary.failedCount, 0);
  assert.equal(summary.progressStatus, 'SUCCESS');
  assert.equal(summary.channelStatus, 'PUBLISHED');
  assert.match(summary.message, /submitted 1\/1 target\(s\)/);
  assert.equal(summary.manualActionRequired, false);
});

test('Facebook pending post URL is accepted even when review status is absent', () => {
  const summary = summarizeFacebookPublishResults([{
    jobPostingId: 'job-2',
    targetType: 'GROUP',
    targetName: 'Hội Nhóm Java Vietnam Test',
    status: 'FAILED',
    facebookReviewStatus: 'UNKNOWN',
    externalPostUrl: 'https://www.facebook.com/groups/123/pending_posts/456',
    message: 'The post URL was recovered after submission.',
  }]);

  assert.equal(summary.successCount, 1);
  assert.equal(summary.failedCount, 0);
  assert.equal(summary.progressStatus, 'SUCCESS');
  assert.match(summary.message, /submitted 1\/1 target\(s\)/);
});
