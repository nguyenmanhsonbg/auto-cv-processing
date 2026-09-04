import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hasPostedRoute,
  hasRejectedPostPageEvidence,
  resolveFacebookHistoryStatusAfterCollectionCheck,
} from './facebook-review-status-network-capture.ts';

function collectionEvidence(
  overrides: Partial<Parameters<typeof resolveFacebookHistoryStatusAfterCollectionCheck>[0]['pending']> = {},
) {
  return {
    matched: false,
    dataObserved: true,
    routeLoaded: true,
    ...overrides,
  };
}

function routeDefinitionResponse(
  groupId: string,
  postId: string,
  error = false,
) {
  return {
    url: 'https://www.facebook.com/ajax/bulk-route-definitions/',
    type: 'Fetch',
    postData: '',
    body: `for (;;);${JSON.stringify({
      payload: {
        payloads: {
          [`/groups/${groupId}/posts/${postId}/`]: {
            error,
            result: {
              exports: {
                canonicalRouteName: 'comet.fbweb.CometSinglePostDialogRoute',
                tracePolicy: 'comet.post.single_dialog.group',
                rootView: { props: { groupID: groupId, storyID: postId } },
              },
            },
          },
        },
      },
    })}`,
  };
}

test('does not classify a Facebook post as posted when its page is pending approval', () => {
  const groupId = '1934436680847972';
  const postId = '1986115005680139';
  const postedUrl = `https://www.facebook.com/groups/${groupId}/posts/${postId}/`;
  const responses = [
    routeDefinitionResponse(groupId, postId),
    {
      url: postedUrl,
      type: 'Document',
      postData: '',
      body: [
        'CometStoryPendingParticipationPostLayoutStrategy',
        'Bài viết đang chờ phê duyệt',
        `/groups/${groupId}/pending_posts/${postId}/`,
      ].join(' '),
    },
  ];

  assert.equal(hasPostedRoute(responses, groupId, postId, postedUrl), false);
});

test('classifies a Facebook post as posted when no pending evidence exists', () => {
  const groupId = '1934436680847972';
  const postId = '1986113735680266';
  const postedUrl = `https://www.facebook.com/groups/${groupId}/posts/${postId}/`;

  assert.equal(
    hasPostedRoute([
      routeDefinitionResponse(groupId, postId),
      {
        url: postedUrl,
        type: 'Document',
        postData: '',
        body: 'Hội Nhóm FullStack Hà Nội [HN] VIETTEL CYBER SECURITY TUYỂN DỤNG BACKEND DEVELOPER',
      },
    ], groupId, postId, postedUrl),
    true,
  );
});

test('detects a rejected Facebook post from the error route returned for its exact URL', () => {
  const groupId = '1934436680847972';
  const postId = '1986115005680139';
  const postedUrl = `https://www.facebook.com/groups/${groupId}/posts/${postId}/`;

  assert.equal(
    hasRejectedPostPageEvidence([
      routeDefinitionResponse(groupId, postId, true),
      {
        url: postedUrl,
        type: 'Document',
        postData: '',
        body: [
          'CometErrorRoot.react',
          'Bạn hiện không xem được nội dung này',
          'đã xóa nội dung',
          postId,
        ].join(' '),
      },
    ], groupId, postId, postedUrl),
    true,
  );
});

test('resolves a history item as pending when the pending collection contains it', () => {
  assert.equal(
    resolveFacebookHistoryStatusAfterCollectionCheck({
      initialStatus: 'UNKNOWN',
      pending: collectionEvidence({ matched: true }),
      published: collectionEvidence(),
    }),
    'PENDING_REVIEW',
  );
});

test('resolves a history item as posted when the published collection contains it', () => {
  assert.equal(
    resolveFacebookHistoryStatusAfterCollectionCheck({
      initialStatus: 'UNKNOWN',
      pending: collectionEvidence(),
      published: collectionEvidence({ matched: true }),
    }),
    'POSTED',
  );
});

test('resolves a history item as rejected when both collections loaded without the item', () => {
  assert.equal(
    resolveFacebookHistoryStatusAfterCollectionCheck({
      initialStatus: 'UNKNOWN',
      pending: collectionEvidence(),
      published: collectionEvidence(),
    }),
    'REJECTED',
  );
});

test('preserves the current status when Facebook did not return both collections', () => {
  assert.equal(
    resolveFacebookHistoryStatusAfterCollectionCheck({
      initialStatus: 'PENDING_REVIEW',
      pending: collectionEvidence(),
      published: collectionEvidence({ dataObserved: false, routeLoaded: false }),
    }),
    'PENDING_REVIEW',
  );
});
