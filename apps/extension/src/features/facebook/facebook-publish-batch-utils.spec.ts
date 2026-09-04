import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createFacebookBatchSelection,
  findFirstFacebookSelectableCandidate,
  matchesFacebookUiLabel,
  matchesFacebookSubmitLabel,
  matchesFacebookGroupPickerLabel,
  matchesFacebookGroupPickerTriggerLabel,
  isFacebookPageUrl,
  parseFacebookCrosspostNotifications,
  parseFacebookCrosspostSearchGroups,
  getFacebookBackgroundTabInteractionCommands,
  selectFacebookGroupPickerDialog,
  shouldRetryFacebookGroupPickerDoneClick,
} from './facebook-publish-batch-utils.ts';

const submittedAtMs = 1_787_223_933_614;

function notification(options: {
  groupId: string;
  postId: string;
  createdAtSeconds: number;
  name: string;
  includeDedupKey?: boolean;
}) {
  const dedupKey = `${options.groupId}|${options.postId}|${options.groupId}`;
  return {
    notif_type: 'group_crossposting_published',
    creation_time: { timestamp: options.createdAtSeconds },
    tracking: options.includeDedupKey === false
      ? '{}'
      : JSON.stringify({ dedup_key: dedupKey }),
    body: {
      text: `Đã đăng chéo bài viết của bạn lên ${options.name}.`,
      ranges: [{ entity: { id: options.groupId } }],
    },
    url: `https://www.facebook.com/groups/${options.groupId}/?multi_permalinks=${options.postId}`,
  };
}

test('parses one posted result per selected cross-post group', () => {
  const body = JSON.stringify({
    data: {
      notifications: {
        edges: [
          { node: notification({
            groupId: '1975445239752352',
            postId: '2022578951705647',
            createdAtSeconds: 1_787_223_938,
            name: 'Hội nhóm Java Vietnam Test',
          }) },
          { node: notification({
            groupId: '2031358880918710',
            postId: '2057173895003875',
            createdAtSeconds: 1_787_223_945,
            name: 'Hội nhóm Tuyển dụng React',
          }) },
        ],
      },
    },
  });

  assert.deepEqual(
    parseFacebookCrosspostNotifications(body, {
      selectedGroupIds: ['1975445239752352', '2031358880918710'],
      submittedAtMs,
    }),
    [
      {
        groupId: '1975445239752352',
        externalPostId: '2022578951705647',
        externalPostUrl: 'https://www.facebook.com/groups/1975445239752352/posts/2022578951705647/',
        facebookReviewStatus: 'POSTED',
        createdAtMs: 1_787_223_938_000,
      },
      {
        groupId: '2031358880918710',
        externalPostId: '2057173895003875',
        externalPostUrl: 'https://www.facebook.com/groups/2031358880918710/posts/2057173895003875/',
        facebookReviewStatus: 'POSTED',
        createdAtMs: 1_787_223_945_000,
      },
    ],
  );
});

test('ignores old and unrelated cross-post notifications', () => {
  const body = JSON.stringify({
    data: {
      notifications: {
        edges: [
          { node: notification({
            groupId: '1975445239752352',
            postId: '2022570235039852',
            createdAtSeconds: 1_787_223_100,
            name: 'Hội nhóm Java Vietnam Test',
          }) },
          { node: notification({
            groupId: '9999999999999999',
            postId: '2999999999999999',
            createdAtSeconds: 1_787_223_950,
            name: 'Group ngoài batch',
          }) },
        ],
      },
    },
  });

  assert.deepEqual(
    parseFacebookCrosspostNotifications(body, {
      selectedGroupIds: ['1975445239752352'],
      submittedAtMs,
    }),
    [],
  );
});

test('uses the newest valid notification for a group and parses multi_permalinks without dedup_key', () => {
  const body = JSON.stringify({
    data: {
      notifications: {
        edges: [
          { node: notification({
            groupId: '1975445239752352',
            postId: '2022578951705647',
            createdAtSeconds: 1_787_223_938,
            name: 'Hội nhóm Java Vietnam Test',
          }) },
          { node: notification({
            groupId: '1975445239752352',
            postId: '2022578951705700',
            createdAtSeconds: 1_787_223_940,
            name: 'Hội nhóm Java Vietnam Test',
            includeDedupKey: false,
          }) },
        ],
      },
    },
  });

  assert.deepEqual(
    parseFacebookCrosspostNotifications(body, {
      selectedGroupIds: ['1975445239752352'],
      submittedAtMs,
    }),
    [{
      groupId: '1975445239752352',
      externalPostId: '2022578951705700',
      externalPostUrl: 'https://www.facebook.com/groups/1975445239752352/posts/2022578951705700/',
      facebookReviewStatus: 'POSTED',
      createdAtMs: 1_787_223_940_000,
    }],
  );
});

test('creates an anchor and cross-post target list without duplicating the anchor', () => {
  const targets = [
    { targetExternalId: 'anchor', targetName: 'Anchor' },
    { targetExternalId: 'cross-post-1', targetName: 'Cross post 1' },
    { targetExternalId: 'cross-post-2', targetName: 'Cross post 2' },
  ];

  assert.deepEqual(createFacebookBatchSelection(targets), {
    anchor: targets[0],
    crosspostTargets: [targets[1], targets[2]],
  });
  assert.equal(createFacebookBatchSelection(targets.slice(0, 1)), null);
});

test('rejects a batch when a selected group has no stable Facebook external id', () => {
  assert.equal(createFacebookBatchSelection([
    { targetExternalId: 'anchor', targetName: 'Anchor' },
    { targetExternalId: null, targetName: 'Missing id' },
  ]), null);
});

test('parses stable group ids from the Facebook crosspost search response', () => {
  assert.deepEqual(
    parseFacebookCrosspostSearchGroups(JSON.stringify({
      data: {
        me: {
          groups_eligible_for_group_composer_crossposting: {
            nodes: [
              { id: '1975445239752352', name: 'Hội nhóm Java Vietnam Test' },
              { id: '2031358880918710', name: 'Hội nhóm Tuyển dụng React' },
            ],
          },
        },
      },
    })),
    [
      { groupId: '1975445239752352', name: 'Hội nhóm Java Vietnam Test' },
      { groupId: '2031358880918710', name: 'Hội nhóm Tuyển dụng React' },
    ],
  );
});

test('recognizes a Facebook button when aria-label and visible text repeat the label', () => {
  assert.equal(matchesFacebookUiLabel('Xong Xong', 'Xong'), true);
  assert.equal(matchesFacebookUiLabel('Xong', 'Xong'), true);
  assert.equal(matchesFacebookUiLabel('Hủy Xong', 'Xong'), true);
  assert.equal(matchesFacebookUiLabel('Hủy', 'Xong'), false);
});

test('recognizes the native Facebook submit button label in Vietnamese and English', () => {
  assert.equal(matchesFacebookSubmitLabel('Đăng'), true);
  assert.equal(matchesFacebookSubmitLabel('Đăng Đăng'), true);
  assert.equal(matchesFacebookSubmitLabel('Post'), true);
  assert.equal(matchesFacebookSubmitLabel('Bình luận'), false);
});

test('recognizes both Facebook group-picker trigger labels', () => {
  assert.equal(matchesFacebookGroupPickerLabel('Thêm nhóm'), true);
  assert.equal(matchesFacebookGroupPickerLabel('+ Thêm nhóm'), true);
  assert.equal(matchesFacebookGroupPickerLabel('Chọn thêm nhóm'), true);
  assert.equal(matchesFacebookGroupPickerLabel('2 nhóm'), false);
  assert.equal(matchesFacebookGroupPickerLabel('+ 2 nhóm'), false);
  assert.equal(matchesFacebookGroupPickerLabel('Nhóm công khai'), false);
});

test('recognizes the selected-count label as the same Facebook group-picker trigger', () => {
  assert.equal(matchesFacebookGroupPickerTriggerLabel('Thêm nhóm'), true);
  assert.equal(matchesFacebookGroupPickerTriggerLabel('+ 2 nhóm'), true);
  assert.equal(matchesFacebookGroupPickerTriggerLabel('+5 nhóm'), true);
  assert.equal(matchesFacebookGroupPickerTriggerLabel('2 nhóm'), true);
  assert.equal(matchesFacebookGroupPickerTriggerLabel('Nhóm công khai'), false);
});

test('ignores a stale hidden picker and keeps the active picker as the selected dialog', () => {
  const staleHiddenPicker = {
    id: 'stale-hidden-picker',
    hasVisibleSearchInput: false,
    hasPickerTitle: true,
    isRendered: false,
    isAriaHidden: false,
  };
  const composerDialog = {
    id: 'composer',
    hasVisibleSearchInput: false,
    hasPickerTitle: true,
    isRendered: true,
    isAriaHidden: false,
  };
  const activePicker = {
    id: 'active-picker',
    hasVisibleSearchInput: true,
    hasPickerTitle: true,
    isRendered: true,
    isAriaHidden: false,
  };

  assert.equal(
    selectFacebookGroupPickerDialog([staleHiddenPicker, composerDialog]),
    null,
  );
  assert.equal(
    selectFacebookGroupPickerDialog([staleHiddenPicker, composerDialog, activePicker]),
    activePicker,
  );
});

test('keeps a visibly rendered picker even when Facebook marks its wrapper aria-hidden', () => {
  const renderedAriaHiddenPicker = {
    id: 'rendered-aria-hidden-picker',
    hasVisibleSearchInput: true,
    hasPickerTitle: true,
    isRendered: true,
    isAriaHidden: true,
  };

  assert.equal(
    selectFacebookGroupPickerDialog([renderedAriaHiddenPicker]),
    renderedAriaHiddenPicker,
  );
});

test('uses the coordinate fallback only when the picker remains open after DOM click', () => {
  const validPoint = { clientX: 953, clientY: 759 };
  assert.equal(
    shouldRetryFacebookGroupPickerDoneClick({
      ok: false,
      retryWithCoordinateClick: true,
      doneButton: validPoint,
    }),
    true,
  );
  assert.equal(
    shouldRetryFacebookGroupPickerDoneClick({
      ok: true,
      retryWithCoordinateClick: true,
      doneButton: validPoint,
    }),
    false,
  );
  assert.equal(
    shouldRetryFacebookGroupPickerDoneClick({
      ok: false,
      retryWithCoordinateClick: false,
      doneButton: validPoint,
    }),
    false,
  );
  assert.equal(
    shouldRetryFacebookGroupPickerDoneClick({
      ok: false,
      retryWithCoordinateClick: true,
      doneButton: null,
    }),
    false,
  );
});

test('distinguishes a Facebook execution document from the extension or AMIS document', () => {
  assert.equal(isFacebookPageUrl('https://www.facebook.com/groups/123456789'), true);
  assert.equal(isFacebookPageUrl('https://m.facebook.com/groups/123456789'), true);
  assert.equal(isFacebookPageUrl('https://amisapp.misa.vn/recruitment/123456789'), false);
  assert.equal(isFacebookPageUrl('chrome-extension://extension-id/side-panel.html'), false);
  assert.equal(isFacebookPageUrl(null), false);
});

test('keeps a background Facebook tab interactive without bringing it to the front', () => {
  assert.deepEqual(getFacebookBackgroundTabInteractionCommands(), [
    {
      method: 'Emulation.setFocusEmulationEnabled',
      params: { enabled: true },
    },
    {
      method: 'Page.setWebLifecycleState',
      params: { state: 'active' },
    },
  ]);
});

test('skips a selected chip and keeps looking for the selectable group row', () => {
  const selectedChip = { kind: 'selected-chip', hasCheckbox: false };
  const selectableRow = { kind: 'group-row', hasCheckbox: true };

  assert.deepEqual(
    findFirstFacebookSelectableCandidate(
      [selectedChip, selectableRow],
      (candidate) => candidate.hasCheckbox,
    ),
    selectableRow,
  );
});
