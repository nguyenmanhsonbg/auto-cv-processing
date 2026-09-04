# Facebook batch posting in a hidden tab

## Purpose

This document records the verified implementation and debugging rules for
posting one recruitment message to multiple Facebook groups from the browser
extension. Read this document before changing the Facebook batch flow so that
the hidden-tab interaction, group-picker handling, and failure boundaries are
preserved.

This is a technical reference only. Never store Facebook cookies, access
tokens, passwords, or raw HAR authentication headers in this document.

## Current intended flow

1. Build one batch plan with an anchor group and the remaining cross-post
   groups. Every target must have a stable Facebook group ID.
2. Open a temporary Facebook target tab with `openTab(targetUrl, false)`. The
   second argument is important: the tab must remain hidden from the user.
3. Attach `chrome.debugger` to the hidden tab and enable:
   - `Network.enable` for Facebook GraphQL observation;
   - `Emulation.setFocusEmulationEnabled({ enabled: true })`;
   - `Page.setWebLifecycleState({ state: "active" })`.
4. Do not call `Page.bringToFront`. The user's current AMIS tab must remain in
   front.
5. Prepare the Facebook composer in the page context.
6. Open the Facebook group picker, search for each selected group, select the
   matching row, and click `Xong`.
7. If the DOM click does not close the picker, calculate the visible button
   center from `getBoundingClientRect()` and dispatch a CDP mouse click through
   the already attached debugger. This fallback also must not bring the tab to
   front.
8. Click the Facebook `Đăng` button and observe the composer submission
   mutation (`ComposerStoryCreateMutation`) or trusted post-click evidence.
9. Report the result to the backend and clean up the debugger/tab according to
   the existing success/failure policy.

## Hidden-tab invariants

- Hidden means the temporary Facebook tab is created with `openTab(url,
  false)`; it does not mean the renderer is allowed to become frozen.
- `Page.setWebLifecycleState("active")` and focus emulation keep the renderer
  processing DOM events while it remains hidden.
- Coordinate clicks use `Input.dispatchMouseEvent` with viewport client
  coordinates. They must not use `Page.bringToFront`.
- The debugger remains attached while the fallback click is dispatched. The
  fallback must detach only if it attached the debugger itself.
- A failed diagnostic tab may remain open only through the existing debug
  setting; this is not part of the normal successful flow.

## Facebook group-picker rules

Facebook can retain multiple React dialog nodes at the same time. The dialog
that should be used is the one that satisfies all of these conditions:

- `role="dialog"`;
- contains a rendered group-search input;
- its rendered text or accessible label contains `Thêm nhóm` or `Chọn nhóm`;
- has non-zero visible geometry in the current viewport.

`aria-hidden="true"` is not authoritative. Facebook may leave that attribute
on a modal wrapper even while the actual picker is visibly rendered through
another React layer. Use rendered geometry as the primary signal and use
`aria-hidden` only to prefer one rendered candidate over another.

The function passed to `chrome.scripting.executeScript` is serialized and
executed in the Facebook page. Therefore every runtime dependency used by that
function must be declared inside the function itself. Do not call an imported
extension-module helper from the injected page function. Type-only references
are safe after compilation; runtime imports are not.

## Why the picker bug happened

The failed run left the `Thêm nhóm` popup open and the worker recorded only a
generic failure. The HAR evidence showed:

- `autofacebook.har` contained successful group-picker/search GraphQL requests,
  but no successful post-creation result;
- `serviceworker.har` recorded `publish-results` responses with HTTP `201`,
  `status: FAILED`, `externalPostId: null`, and `submittedAt: null`;
- the previous picker fix rejected a visibly rendered dialog when its wrapper
  was `aria-hidden`, and the injected function also referenced an imported
  helper that was not available in the serialized page context.

The combination caused automation to stop before the `Xong` step while the
visible popup stayed open.

## Regression checks

Before changing this flow, preserve tests for:

- stale/non-rendered dialogs are ignored;
- a rendered picker is accepted even when `isAriaHidden` is true;
- the coordinate fallback is used only when the DOM click left the picker open
  and a finite button point is available;
- background interaction enables the lifecycle/focus commands without a
  bring-to-front command;
- the Facebook submit-button selector does not choose a comment button.

Required verification after code changes:

1. Run the relevant Facebook tests.
2. Run extension typecheck.
3. Build/reload the extension when validating the packaged artifact.
4. Test with a real Facebook session in a hidden temporary tab and confirm the
   AMIS tab never loses focus.
5. If a run fails, inspect these logs in order:
   - `[FB_BACKGROUND_TAB_INTERACTION_READY]`;
   - `[FB_BATCH_PICKER_TARGET]`;
   - `[FB_BATCH_GROUP_SELECTION_RESULT]`;
   - `[FB_BATCH_GROUP_SELECTION_COORDINATE_RESULT]`;
   - `[FB15_TARGET_RESULT]` and the backend `publish-results` payload.

## Implemented batch completion policy: finish after the anchor submission

The batch flow now uses the following completion boundary:

- after Facebook accepts the `Đăng` action and the anchor submission endpoint
  or trusted submission evidence is available, stop the batch operation;
- persist the batch post/history record immediately;
- return the user-facing status `Đã đăng`;
- do not wait for Facebook notifications or independently probe every target
  group to discover each child post URL;
- child-group post URLs may remain empty at this stage and will be resolved by
  a later history-check flow.

The success boundary for that change is the accepted anchor submission, not
the availability of a URL for every selected group. The later history flow can
reconcile individual group URLs asynchronously without slowing the initial
posting action.

### Synchronous child-group lookup is disabled

The old implementation called `collectFacebookCrosspostResults` after the
anchor submit. That path waited for cross-post notifications, then navigated
the hidden tab to each missing target group and waited again before checking
notifications. The batch publish path now skips that function by policy via
`shouldSkipFacebookCrosspostResolution`.

This behavior was the source of the long delay. It is not required to decide
whether the initial batch submission was accepted and is no longer part of the
synchronous batch posting path.

### Desired result contract

For a multi-group batch, the synchronous operation should:

1. select all groups in the composer;
2. click `Đăng` once;
3. wait only for the anchor's accepted submit mutation or trusted submit
   evidence;
4. persist the posting-history record with the batch/group references and the
   anchor endpoint when one is available;
5. return `Đã đăng` immediately.

The initial record may contain no individual URL for the cross-post groups.
That is intentional. A later history-sync job will resolve those URLs and
update the record. Do not report a batch as failed merely because Facebook has
not yet returned child-group notifications.

## Scope guardrails

Changes to this flow must not alter unrelated AMIS, CV, interview evaluation,
Freelancer, Internal, TopCV, or single-group Facebook behavior. Keep the batch
optimization isolated behind the existing multi-group path and preserve the
current error/reporting contract for failures that occur before Facebook
accepts the submission.
