import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hasPostedRoute,
  hasRejectedPostPageEvidence,
} from './facebook-review-status-network-capture.ts';

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
