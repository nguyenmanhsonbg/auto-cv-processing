import { ApiClientError, reportFacebookPublishResult } from './api-client';
import { getAccessToken } from './auth-store';
import { summarizeFacebookPublishResults } from './facebook-channel-status';
import { FACEBOOK_MAX_IMAGE_ATTACHMENTS } from './config';
import {
  buildFacebookGroupPostUrl,
  parseFacebookGroupPostUrl,
  type FacebookGroupPostPathType,
} from './facebook-post-url';
import type {
  FacebookImageAttachFailureContext,
  FacebookImageAttachFailureDecision,
  FacebookPublishImageAttachment,
  FacebookPublishHistoryListItem,
  FacebookPublishHistoryStatusCheckRequest,
  FacebookPublishPlan,
  FacebookPublishProgress,
  FacebookPublishResultPayload,
  FacebookPublishTarget,
  FacebookReviewStatus,
} from './types';

interface FacebookPublishCallbacks {
  onProgress?: (progress: FacebookPublishProgress) => void;
  onImageAttachFailed?: (
    context: FacebookImageAttachFailureContext,
  ) => FacebookImageAttachFailureDecision | Promise<FacebookImageAttachFailureDecision>;
}

export type FacebookSessionStatus = 'CHECKING_LOGIN' | 'WAITING_LOGIN' | 'READY';

export interface FacebookSessionEvent {
  status: FacebookSessionStatus;
  message: string;
  url?: string;
}

interface FacebookSessionCallbacks {
  onStatus?: (event: FacebookSessionEvent) => void;
  allowInteractiveLogin?: boolean;
}

interface FacebookLoginCheckResult {
  ready: boolean;
  url: string;
  message: string;
}

export interface FacebookGroupEligibilityResult {
  eligibilityStatus: 'UNKNOWN' | 'CAN_POST' | 'CANNOT_POST';
  eligibilityReason: string;
  verifiedAt: string;
}

interface FacebookPagePublishResult {
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  message: string;
  externalPostId?: string | null;
  externalPostUrl?: string | null;
  submitClickDispatched?: boolean;
  postClickEvidence?: boolean;
  doNotRetry?: boolean;
}

interface FacebookPostReviewStatusProbeInput {
  title?: string | null;
  contentPreview?: string | null;
  externalPostUrl?: string | null;
  expectedPathType?: FacebookGroupPostPathType | null;
}

interface FacebookPostReviewStatusProbeResult {
  facebookReviewStatus: FacebookReviewStatus;
  message: string;
  externalPostId?: string | null;
  externalPostUrl?: string | null;
  postOpenClickPoints?: FacebookSubmitButtonPoint[] | null;
  timestampClickPoint?: FacebookSubmitButtonPoint | null;
  timestampClickPoints?: FacebookSubmitButtonPoint[] | null;
}

interface FacebookSubmitButtonPoint {
  clientX: number;
  clientY: number;
  label: string;
  rect?: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}

interface FacebookPreparedPostResult {
  status: 'READY_TO_SUBMIT' | 'IMAGE_ATTACH_FAILED' | 'FAILED';
  message: string;
  submitButton?: FacebookSubmitButtonPoint;
}

interface FacebookSubmitButtonPointProbe {
  found: boolean;
  submitButton?: FacebookSubmitButtonPoint;
}

interface FacebookSubmitPreflightResult {
  ready: boolean;
  message: string;
}

interface FacebookSubmitActivationResult {
  activated: boolean;
  message: string;
  submitButton?: FacebookSubmitButtonPoint | null;
}

interface FacebookSubmitDiagnosticInput {
  targetUrl?: string | null;
  targetExternalId?: string | null;
  tabActive?: boolean | null;
  clickPoint?: FacebookSubmitButtonPoint | null;
  activationMode?: string | null;
}

interface FacebookPendingPostUrlRecoveryInput {
  title?: string | null;
  contentPreview?: string | null;
  targetUrl?: string | null;
  targetExternalId?: string | null;
  requireRecent?: boolean | null;
}

interface FacebookPendingPostOpenSurfaceProbeInput extends FacebookPendingPostUrlRecoveryInput {
  clickPoint?: FacebookSubmitButtonPoint | null;
}

interface FacebookPendingPostOpenSurfaceProbeResult {
  externalPostUrl?: string | null;
  clickPoints?: FacebookSubmitButtonPoint[] | null;
  diagnostics?: string | null;
}

interface FacebookSubmittedPostRecoveryResult {
  probe: FacebookPostReviewStatusProbeResult | null;
  postUrl: NonNullable<ReturnType<typeof parseFacebookGroupPostUrl>> | null;
}

type FacebookParsedGroupPostUrl = NonNullable<ReturnType<typeof parseFacebookGroupPostUrl>>;

interface FacebookTabClickSnapshot {
  existingTabIds: Set<number>;
  sourceWindowId?: number;
}

interface FacebookPostUrlDetectionResult {
  postUrl: FacebookParsedGroupPostUrl | null;
  matchedExpectedGroup: boolean;
  trustedTimestampNavigation: boolean;
  source: 'current-tab' | 'new-tab' | null;
  sourceTabId?: number;
  observedUrl?: string | null;
  openedTabIds: number[];
  mismatchedPostUrl?: FacebookParsedGroupPostUrl | null;
}

export async function publishFacebookPlan(
  accessToken: string,
  plan: FacebookPublishPlan,
  callbacks: FacebookPublishCallbacks = {},
) {
  const results: FacebookPublishResultPayload[] = [];
  const total = plan.targets.length;

  if (total === 0) {
    callbacks.onProgress?.({
      status: 'ERROR',
      currentIndex: 0,
      total,
      message: 'No Facebook targets are configured.',
      results,
    });
    return results;
  }

  callbacks.onProgress?.({
    status: 'LOGIN_REQUIRED',
    currentIndex: 0,
    total,
    message: 'Checking Facebook login in this browser.',
    results,
  });
  try {
    await ensureFacebookSession({
      onStatus: (event) => {
        if (event.status !== 'WAITING_LOGIN') return;
        callbacks.onProgress?.({
          status: 'WAITING_LOGIN',
          currentIndex: 0,
          total,
          message: event.message,
          results,
        });
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Facebook login could not be completed.';
    await reportAllTargetsFailed(accessToken, plan, message, results);
    callbacks.onProgress?.({
      status: 'ERROR',
      currentIndex: 0,
      total,
      message,
      results,
    });
    return results;
  }

  for (let index = 0; index < plan.targets.length; index += 1) {
    const target = plan.targets[index];
    const imageAttachments = getFacebookPublishImageAttachments(plan);
    try {
      callbacks.onProgress?.({
        status: 'POSTING',
        currentIndex: index + 1,
        total,
        target,
        message: `Posting to ${target.targetName}.`,
        results,
      });

      const result = await publishTarget(target, plan.content, imageAttachments, callbacks);
      const payload = buildFacebookPublishResultPayload(plan, target, result);

      callbacks.onProgress?.({
        status: 'REPORTING',
        currentIndex: index + 1,
        total,
        target,
        message: `Saving Facebook result for ${target.targetName}.`,
        results,
      });
      const reportErrorMessage = await reportFacebookPublishResultSafely(accessToken, payload);
      results.push(withReportMessage(payload, reportErrorMessage));
    } catch (error) {
      const payload = buildUnexpectedFacebookPublishFailurePayload(
        plan,
        target,
        `FB_TARGET_UNEXPECTED_ERROR: Facebook publish target failed before it could produce a result. ${toAutomationErrorMessage(error)}`,
      );

      callbacks.onProgress?.({
        status: 'REPORTING',
        currentIndex: index + 1,
        total,
        target,
        message: `Saving Facebook failure for ${target.targetName}.`,
        results,
      });
      const reportErrorMessage = await reportFacebookPublishResultSafely(accessToken, payload);
      results.push(withReportMessage(payload, reportErrorMessage));
    }

    if (index < plan.targets.length - 1) {
      const delayMs = randomDelay(plan.delay.minMs, plan.delay.maxMs);
      await waitBetweenFacebookTargets(delayMs, {
        currentIndex: index + 1,
        total,
        target,
        results,
        onProgress: callbacks.onProgress,
      });
    }
  }

  const summary = summarizeFacebookPublishResults(results);
  callbacks.onProgress?.({
    status: summary.progressStatus,
    currentIndex: total,
    total,
    message: summary.message,
    results,
  });

  return results;
}

function buildFacebookPublishResultPayload(
  plan: FacebookPublishPlan,
  target: FacebookPublishTarget,
  result: FacebookPagePublishResult,
): FacebookPublishResultPayload {
  const externalPost = parseFacebookGroupPostUrl(result.externalPostUrl);

  return {
    jobPostingId: plan.jobPostingId,
    targetId: target.targetId ?? null,
    targetType: target.targetType,
    targetName: target.targetName,
    targetUrl: target.targetUrl ?? null,
    content: plan.content,
    status: result.status,
    facebookReviewStatus: getPublishResultReviewStatus(result),
    message: result.message,
    externalPostId: externalPost?.postId ?? result.externalPostId ?? null,
    externalPostUrl: externalPost?.url ?? null,
    submittedAt: result.status === 'SUCCESS' ? new Date().toISOString() : null,
  };
}

function buildUnexpectedFacebookPublishFailurePayload(
  plan: FacebookPublishPlan,
  target: FacebookPublishTarget,
  message: string,
): FacebookPublishResultPayload {
  return {
    jobPostingId: plan.jobPostingId,
    targetId: target.targetId ?? null,
    targetType: target.targetType,
    targetName: target.targetName,
    targetUrl: target.targetUrl ?? null,
    content: plan.content,
    status: 'FAILED',
    facebookReviewStatus: 'UNKNOWN',
    message,
    externalPostId: null,
    externalPostUrl: null,
    submittedAt: null,
  };
}

async function waitBetweenFacebookTargets(
  delayMs: number,
  options: {
    currentIndex: number;
    total: number;
    target: FacebookPublishTarget;
    results: FacebookPublishResultPayload[];
    onProgress?: (progress: FacebookPublishProgress) => void;
  },
) {
  const deadline = Date.now() + Math.max(0, delayMs);

  while (Date.now() < deadline) {
    const remainingMs = Math.max(0, deadline - Date.now());
    options.onProgress?.({
      status: 'DELAYING',
      currentIndex: options.currentIndex,
      total: options.total,
      target: options.target,
      message: `Waiting ${Math.ceil(remainingMs / 1000)}s before the next Facebook group.`,
      results: options.results,
    });
    await sleep(Math.min(1_000, remainingMs));
  }
}

export async function ensureFacebookSession(callbacks: FacebookSessionCallbacks = {}) {
  callbacks.onStatus?.({
    status: 'CHECKING_LOGIN',
    message: 'Checking Facebook login in this browser.',
  });

  const tab = await openTab('https://www.facebook.com/', false);
  let status: FacebookLoginCheckResult | null = null;
  let closeAfterCheck = true;

  try {
    await waitForTabComplete(tab.id);
    status = await runScript<[], FacebookLoginCheckResult>(tab.id, checkFacebookLoginInPage, []);
    if (status.ready) {
      callbacks.onStatus?.({
        status: 'READY',
        message: status.message,
        url: status.url,
      });
      return status;
    }

    if (callbacks.allowInteractiveLogin === false) {
      throw new Error('Facebook login is not ready in the background tab.');
    }

    closeAfterCheck = false;
    callbacks.onStatus?.({
      status: 'WAITING_LOGIN',
      message: 'Facebook login is required. Please complete login in the opened tab.',
      url: status.url,
    });

    await chrome.tabs?.update(tab.id, { url: 'https://www.facebook.com/login', active: true });
    const deadline = Date.now() + 10 * 60_000;
    while (Date.now() < deadline) {
      await sleep(2_000);
      await waitForTabComplete(tab.id);
      status = await runScript<[], FacebookLoginCheckResult>(tab.id, checkFacebookLoginInPage, []);
      if (status.ready) {
        closeAfterCheck = true;
        callbacks.onStatus?.({
          status: 'READY',
          message: status.message,
          url: status.url,
        });
        return status;
      }
    }

    throw new Error(status.message || 'Facebook login timed out.');
  } finally {
    if (closeAfterCheck) {
      await closeTabSafely(tab.id);
    }
  }
}

export async function verifyFacebookGroupPostingEligibility(
  target: FacebookPublishTarget,
): Promise<FacebookGroupEligibilityResult> {
  if (target.targetType !== 'GROUP') {
    return {
      eligibilityStatus: 'CANNOT_POST',
      eligibilityReason: `${target.targetType} eligibility verification is not implemented yet.`,
      verifiedAt: new Date().toISOString(),
    };
  }

  if (!target.targetUrl) {
    return {
      eligibilityStatus: 'CANNOT_POST',
      eligibilityReason: 'Facebook group URL is required.',
      verifiedAt: new Date().toISOString(),
    };
  }

  await ensureFacebookSession();

  const tab = await openTab(target.targetUrl, false);
  try {
    await waitForTabComplete(tab.id);
    await sleep(randomDelay(1_500, 3_000));
    const hiddenResult = await runScript<[], FacebookGroupEligibilityResult>(
      tab.id,
      checkFacebookGroupPostingEligibilityInPage,
      [],
    );
    if (hiddenResult.eligibilityStatus !== 'UNKNOWN') {
      return hiddenResult;
    }

    await activateTab(tab.id);
    await sleep(randomDelay(900, 1_500));
    await waitForTabComplete(tab.id);

    const visibleResult = await runScript<[], FacebookGroupEligibilityResult>(
      tab.id,
      checkFacebookGroupPostingEligibilityInPage,
      [],
    );

    return visibleResult.eligibilityStatus === 'UNKNOWN'
      ? {
        ...visibleResult,
        eligibilityReason: `${visibleResult.eligibilityReason} Hidden and visible verification could not prove posting eligibility.`,
      }
      : visibleResult;
  } catch (error) {
    return {
      eligibilityStatus: 'UNKNOWN',
      eligibilityReason: toAutomationErrorMessage(error),
      verifiedAt: new Date().toISOString(),
    };
  } finally {
    await closeTabSafely(tab.id);
  }
}

export async function refreshFacebookPostReviewStatus(
  history: FacebookPublishHistoryListItem,
): Promise<FacebookPublishHistoryStatusCheckRequest> {
  const checkedAt = new Date().toISOString();
  const unresolvedStatus = getUnresolvedFacebookReviewStatus(history);
  const postUrl = parseFacebookGroupPostUrl(history.externalPostUrl);
  if (!postUrl) {
    return recoverFacebookPendingPostUrlFromGroup(history, checkedAt);
  }

  try {
    await ensureFacebookSession({ allowInteractiveLogin: false });
  } catch (error) {
    return {
      facebookReviewStatus: unresolvedStatus,
      message: `Post status check skipped: ${toAutomationErrorMessage(error)}`,
      externalPostId: postUrl.postId,
      externalPostUrl: postUrl.url,
      checkedAt,
    };
  }

  const postedUrl = buildFacebookGroupPostUrl(postUrl.groupId, postUrl.postId, 'posts');
  const pendingUrl = buildFacebookGroupPostUrl(postUrl.groupId, postUrl.postId, 'pending_posts');
  const shouldCheckPendingFirst = postUrl.pathType === 'pending_posts'
    && history.facebookReviewStatus !== 'POSTED';
  const tab = await openTab(shouldCheckPendingFirst ? pendingUrl : postedUrl, false);
  try {
    await waitForTabComplete(tab.id);
    await sleep(randomDelay(1_500, 3_000));

    const checkPendingUrl = async () => {
      const pendingResult = await runScript<[FacebookPostReviewStatusProbeInput], FacebookPostReviewStatusProbeResult>(
        tab.id,
        checkFacebookPostReviewStatusInPage,
        [{
          title: history.title,
          contentPreview: history.contentPreview ?? null,
          externalPostUrl: pendingUrl,
          expectedPathType: 'pending_posts',
        }],
      );
      const normalizedPendingUrl = parseFacebookGroupPostUrl(pendingResult.externalPostUrl)?.url ?? pendingUrl;
      const unresolvedProbe = pendingResult.facebookReviewStatus === 'PENDING_REVIEW'
        && history.facebookReviewStatus === 'UNKNOWN'
        && /not visible|not detectable|unavailable|could not/i.test(pendingResult.message);

      return {
        facebookReviewStatus: unresolvedProbe ? 'UNKNOWN' : pendingResult.facebookReviewStatus,
        message: pendingResult.message,
        externalPostId: postUrl.postId,
        externalPostUrl: normalizedPendingUrl,
        checkedAt,
      } satisfies FacebookPublishHistoryStatusCheckRequest;
    };

    if (shouldCheckPendingFirst) {
      const pendingFirstResult = await checkPendingUrl();
      if (pendingFirstResult.facebookReviewStatus === 'PENDING_REVIEW') {
        return pendingFirstResult;
      }

      if (pendingFirstResult.facebookReviewStatus === 'REJECTED') {
        return pendingFirstResult;
      }

      await chrome.tabs?.update(tab.id, { url: postedUrl });
      await waitForTabComplete(tab.id);
      await sleep(randomDelay(1_500, 3_000));
    }

    const postedResult = await runScript<[FacebookPostReviewStatusProbeInput], FacebookPostReviewStatusProbeResult>(
      tab.id,
      checkFacebookPostReviewStatusInPage,
      [{
        title: history.title,
        contentPreview: history.contentPreview ?? null,
        externalPostUrl: postedUrl,
        expectedPathType: 'posts',
      }],
    );
    if (postedResult.facebookReviewStatus === 'POSTED') {
      const visiblePostUrl = parseFacebookGroupPostUrl(postedResult.externalPostUrl)?.url ?? postedUrl;
      return {
        facebookReviewStatus: 'POSTED',
        message: postedResult.message,
        externalPostId: postUrl.postId,
        externalPostUrl: visiblePostUrl,
        checkedAt,
      };
    }

    if (postedResult.facebookReviewStatus === 'DELETED') {
      return {
        facebookReviewStatus: 'DELETED',
        message: postedResult.message,
        externalPostId: postUrl.postId,
        externalPostUrl: postedResult.externalPostUrl ?? postUrl.url,
        checkedAt,
      };
    }

    await chrome.tabs?.update(tab.id, { url: pendingUrl });
    await waitForTabComplete(tab.id);
    await sleep(randomDelay(1_500, 3_000));

    return await checkPendingUrl();
  } catch (error) {
    return {
      facebookReviewStatus: unresolvedStatus,
      message: `Post status is still pending or not detectable: ${toAutomationErrorMessage(error)}`,
      externalPostId: postUrl.postId,
      externalPostUrl: postUrl.url,
      checkedAt,
    };
  } finally {
    await closeTabSafely(tab.id);
  }
}

async function recoverFacebookPendingPostUrlFromGroup(
  history: FacebookPublishHistoryListItem,
  checkedAt: string,
): Promise<FacebookPublishHistoryStatusCheckRequest> {
  const unresolvedStatus = getUnresolvedFacebookReviewStatus(history);
  const pendingManagerUrl = buildFacebookPendingPostsManagerUrl(history.targetUrl, history.targetExternalId);
  if (!pendingManagerUrl) {
    return {
      facebookReviewStatus: unresolvedStatus,
      message: 'Post status could not be checked because this history has no valid Facebook post URL or group URL yet.',
      externalPostId: history.externalPostId ?? null,
      checkedAt,
    };
  }

  try {
    await ensureFacebookSession();
  } catch (error) {
    return {
      facebookReviewStatus: unresolvedStatus,
      message: `Post status check skipped: ${toAutomationErrorMessage(error)}`,
      externalPostId: history.externalPostId ?? null,
      checkedAt,
    };
  }

  const tab = await openTab(pendingManagerUrl, false);
  try {
    await waitForTabComplete(tab.id);
    await sleep(randomDelay(1_500, 3_000));

    const recoverInCurrentPage = async () => runScript<[FacebookPendingPostUrlRecoveryInput], FacebookPostReviewStatusProbeResult>(
      tab.id,
      recoverFacebookPendingPostUrlInPage,
      [{
        title: history.title,
        contentPreview: history.contentPreview ?? null,
        targetUrl: history.targetUrl ?? null,
        targetExternalId: history.targetExternalId ?? null,
      }],
    );

    let recoveryResult = await recoverInCurrentPage();
    const recoveredUrl = parseFacebookGroupPostUrl(recoveryResult.externalPostUrl);
    if (recoveredUrl) {
      return {
        facebookReviewStatus: recoveredUrl.pathType === 'posts' ? 'POSTED' : 'PENDING_REVIEW',
        message: recoveryResult.message,
        externalPostId: recoveredUrl.postId,
        externalPostUrl: recoveredUrl.url,
        checkedAt,
      };
    }

    let postOpenClickPoints = getPostOpenClickPoints(recoveryResult);
    if (postOpenClickPoints.length > 0) {
      let lastClickErrorMessage: string | null = null;
      let lastDetection: FacebookPostUrlDetectionResult | null = null;
      let lastPageProbeErrorMessage: string | null = null;
      let lastSurfaceProbeMessage: string | null = null;
      let activationErrorMessage: string | null = null;
      let activatedForTimestampClick = false;
      const openedTabIdsToClose = new Set<number>();
      const clickQueue: FacebookSubmitButtonPoint[] = [];
      const queuedClickPointKeys = new Set<string>();

      addUniqueClickPoints(clickQueue, postOpenClickPoints, queuedClickPointKeys);

      activationErrorMessage = await activateTabForTimestampRecovery(tab.id);
      activatedForTimestampClick = !activationErrorMessage;
      if (activatedForTimestampClick) {
        const activePageRecovery = await recoverInCurrentPage().catch((error) => {
          lastPageProbeErrorMessage = toAutomationErrorMessage(error);
          return null;
        });
        if (activePageRecovery) {
          recoveryResult = activePageRecovery;
          const activeRecoveredUrl = parseFacebookGroupPostUrl(recoveryResult.externalPostUrl);
          if (activeRecoveredUrl) {
            return {
              facebookReviewStatus: activeRecoveredUrl.pathType === 'posts' ? 'POSTED' : 'PENDING_REVIEW',
              message: recoveryResult.message,
              externalPostId: activeRecoveredUrl.postId,
              externalPostUrl: activeRecoveredUrl.url,
              checkedAt,
            };
          }

          postOpenClickPoints = getPostOpenClickPoints(recoveryResult);
          addUniqueClickPoints(clickQueue, postOpenClickPoints, queuedClickPointKeys);
        }
      }

      for (let clickIndex = 0; clickIndex < clickQueue.length && clickIndex < 8; clickIndex += 1) {
        const clickPoint = clickQueue[clickIndex];
        if (!clickPoint) continue;
        const tabSnapshot = await snapshotTabsForTimestampClick(tab.id);
        try {
          await clickTabCoordinatePoint(tab.id, clickPoint);
        } catch (error) {
          lastClickErrorMessage = toAutomationErrorMessage(error);
          break;
        }

        const detectedPostUrl = await waitForFacebookPostUrlAfterTimestampClick(
          tab.id,
          history.targetUrl,
          history.targetExternalId,
          tabSnapshot,
          12_000,
        );
        detectedPostUrl.openedTabIds.forEach((openedTabId) => openedTabIdsToClose.add(openedTabId));
        lastDetection = detectedPostUrl;
        if (
          detectedPostUrl.postUrl
          && (detectedPostUrl.matchedExpectedGroup || detectedPostUrl.trustedTimestampNavigation)
        ) {
          await closeAutomationOpenedTabs(openedTabIdsToClose, tab.id);
          return {
            facebookReviewStatus: detectedPostUrl.postUrl.pathType === 'posts' ? 'POSTED' : 'PENDING_REVIEW',
            message: buildRecoveredPendingPostUrlMessage(detectedPostUrl),
            externalPostId: detectedPostUrl.postUrl.postId,
            externalPostUrl: detectedPostUrl.postUrl.url,
            checkedAt,
          };
        }

        await sleep(randomDelay(700, 1_200));
        const surfaceProbeAfterClick = await runScript<[FacebookPendingPostOpenSurfaceProbeInput], FacebookPendingPostOpenSurfaceProbeResult>(
          tab.id,
          inspectFacebookPendingPostOpenSurfaceInPage,
          [{
            title: history.title,
            contentPreview: history.contentPreview ?? null,
            targetUrl: history.targetUrl ?? null,
            targetExternalId: history.targetExternalId ?? null,
            clickPoint,
          }],
        ).catch((error) => {
          lastSurfaceProbeMessage = toAutomationErrorMessage(error);
          return null;
        });
        if (surfaceProbeAfterClick) {
          lastSurfaceProbeMessage = surfaceProbeAfterClick.diagnostics ?? null;
          const surfacePostUrl = parseFacebookGroupPostUrl(surfaceProbeAfterClick.externalPostUrl);
          if (
            surfacePostUrl
            && (
              isExpectedFacebookGroupPostUrl(
                surfacePostUrl,
                getExpectedFacebookGroupIds(history.targetUrl, history.targetExternalId),
              )
              || lastDetection?.trustedTimestampNavigation
            )
          ) {
            await closeAutomationOpenedTabs(openedTabIdsToClose, tab.id);
            return {
              facebookReviewStatus: surfacePostUrl.pathType === 'posts' ? 'POSTED' : 'PENDING_REVIEW',
              message: 'Recovered Facebook group post URL from the menu or dialog opened by the matched pending post controls.',
              externalPostId: surfacePostUrl.postId,
              externalPostUrl: surfacePostUrl.url,
              checkedAt,
            };
          }

          addUniqueClickPoints(clickQueue, surfaceProbeAfterClick.clickPoints ?? [], queuedClickPointKeys);
        }

        const pageRecoveryAfterClick = await recoverInCurrentPage().catch((error) => {
          lastPageProbeErrorMessage = toAutomationErrorMessage(error);
          return null;
        });
        if (pageRecoveryAfterClick) {
          recoveryResult = pageRecoveryAfterClick;
          const clickedUrl = parseFacebookGroupPostUrl(recoveryResult.externalPostUrl);
          if (
            clickedUrl
            && (
              isExpectedFacebookGroupPostUrl(
                clickedUrl,
                getExpectedFacebookGroupIds(history.targetUrl, history.targetExternalId),
              )
              || lastDetection?.trustedTimestampNavigation
            )
          ) {
            await closeAutomationOpenedTabs(openedTabIdsToClose, tab.id);
            return {
              facebookReviewStatus: clickedUrl.pathType === 'posts' ? 'POSTED' : 'PENDING_REVIEW',
              message: recoveryResult.message,
              externalPostId: clickedUrl.postId,
              externalPostUrl: clickedUrl.url,
              checkedAt,
            };
          }

          postOpenClickPoints = getPostOpenClickPoints(recoveryResult);
          addUniqueClickPoints(clickQueue, postOpenClickPoints, queuedClickPointKeys);
        }
      }

      await closeAutomationOpenedTabs(openedTabIdsToClose, tab.id);
      if (isTrustedTimestampClickRequiredMessage(recoveryResult.message)) {
        return {
          facebookReviewStatus: recoveryResult.facebookReviewStatus === 'REJECTED' ? 'REJECTED' : unresolvedStatus,
          message: buildPendingPostTimestampRecoveryFailureMessage({
            clickPointCount: queuedClickPointKeys.size,
            expectedGroupIds: getExpectedFacebookGroupIds(history.targetUrl, history.targetExternalId),
            lastClickErrorMessage,
            lastDetection,
            lastPageProbeErrorMessage,
            lastSurfaceProbeMessage,
            activatedForTimestampClick,
            activationErrorMessage,
          }),
          externalPostId: history.externalPostId ?? null,
          checkedAt,
        };
      }
    }

    return {
      facebookReviewStatus: recoveryResult.facebookReviewStatus === 'REJECTED' ? 'REJECTED' : unresolvedStatus,
      message: recoveryResult.message,
      externalPostId: history.externalPostId ?? null,
      checkedAt,
    };
  } catch (error) {
    return {
      facebookReviewStatus: unresolvedStatus,
      message: `Pending post URL could not be recovered from the group: ${toAutomationErrorMessage(error)}`,
      externalPostId: history.externalPostId ?? null,
      checkedAt,
    };
  } finally {
    await closeTabSafely(tab.id);
  }
}

async function publishTarget(
  target: FacebookPublishTarget,
  content: string,
  imageAttachments: FacebookPublishImageAttachment[],
  callbacks: FacebookPublishCallbacks,
): Promise<FacebookPagePublishResult> {
  if (target.targetType !== 'GROUP') {
    return {
      status: 'SKIPPED',
      message: `${target.targetType} publishing is not implemented in the extension yet.`,
    };
  }

  if (!target.targetUrl) {
    return {
      status: 'FAILED',
      message: 'Facebook group URL is required.',
    };
  }

  let latestFailure: FacebookPagePublishResult | null = null;
  for (let tabAttempt = 0; tabAttempt < 2; tabAttempt += 1) {
    const result: FacebookPagePublishResult = await publishTargetInFreshTab(
      target.targetUrl,
      target.targetExternalId,
      content,
      target,
      imageAttachments,
      callbacks,
    ).catch((error): FacebookPagePublishResult => ({
      status: 'FAILED',
      message: toAutomationErrorMessage(error),
    }));

    latestFailure = result;
    if (
      result.status !== 'FAILED'
      || result.submitClickDispatched
      || result.doNotRetry
      || !isRecoverableTabAutomationFailure(result.message)
    ) {
      return result;
    }

    await sleep(randomDelay(1_200, 2_500));
  }

  return latestFailure ?? {
    status: 'FAILED',
    message: 'Facebook post could not be prepared.',
  };
}

async function publishTargetInFreshTab(
  targetUrl: string,
  targetExternalId: string | null | undefined,
  content: string,
  target: FacebookPublishTarget,
  imageAttachments: FacebookPublishImageAttachment[],
  callbacks: FacebookPublishCallbacks,
): Promise<FacebookPagePublishResult> {
  const tab = await openTab(targetUrl, false);
  try {
    let latestFailure: FacebookPreparedPostResult | null = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await waitForTabComplete(tab.id);
      await sleep(randomDelay(attempt === 0 ? 2_500 : 4_000, attempt === 0 ? 6_000 : 8_000));
      const preparedPost = await runScript<[string, FacebookPublishImageAttachment[]], FacebookPreparedPostResult>(
        tab.id,
        prepareFacebookPostInPage,
        [content, imageAttachments],
      );
      if (preparedPost.status === 'READY_TO_SUBMIT' && preparedPost.submitButton) {
        const submitResult = await submitPreparedPost(
          tab.id,
          preparedPost.submitButton,
          content,
          targetUrl,
          targetExternalId,
        );
        return submitResult;
      }

      if (preparedPost.status === 'IMAGE_ATTACH_FAILED' && imageAttachments.length > 0) {
        const decision = callbacks.onImageAttachFailed
          ? await callbacks.onImageAttachFailed({
              target,
              attachment: imageAttachments[0],
              message: preparedPost.message,
            })
          : 'SKIP';

        if (decision === 'POST_TEXT_ONLY') {
          await closeFacebookPublishTabSafely(tab.id);
          const submitResult = await publishTargetInFreshTab(
            targetUrl,
            targetExternalId,
            content,
            target,
            [],
            callbacks,
          );
          return {
            ...submitResult,
            doNotRetry: true,
            message: submitResult.status === 'SUCCESS'
              ? `Image attach failed; user chose to post text-only. ${submitResult.message}`
              : `Image attach failed; user chose to post text-only, but submit did not complete. ${submitResult.message}`,
          };
        }

        return {
          status: 'SKIPPED',
          message: `Image attach failed; user chose not to publish this post. ${preparedPost.message}`,
        };
      }

      latestFailure = preparedPost;
      if (!shouldRetryPrepareFailure(preparedPost.message)) {
        break;
      }

      if (attempt < 2) {
        await sleep(randomDelay(800, 1_500));
        await reloadTab(tab.id);
        continue;
      }

      break;
    }

    return {
      status: 'FAILED',
      message: latestFailure?.message ?? 'Facebook post could not be prepared.',
    };
  } finally {
    await closeFacebookPublishTabSafely(tab.id);
  }
}

async function reportAllTargetsFailed(
  accessToken: string,
  plan: FacebookPublishPlan,
  message: string,
  results: FacebookPublishResultPayload[],
) {
  for (const target of plan.targets) {
    const payload: FacebookPublishResultPayload = {
      jobPostingId: plan.jobPostingId,
      targetId: target.targetId ?? null,
      targetType: target.targetType,
      targetName: target.targetName,
      targetUrl: target.targetUrl ?? null,
      content: plan.content,
      status: 'FAILED',
      facebookReviewStatus: 'UNKNOWN',
      message,
      externalPostId: null,
      externalPostUrl: null,
      submittedAt: null,
    };

    const reportErrorMessage = await reportFacebookPublishResultSafely(accessToken, payload);
    results.push(withReportMessage(payload, reportErrorMessage));
  }
}

function getFacebookPublishImageAttachments(plan: FacebookPublishPlan): FacebookPublishImageAttachment[] {
  return plan.attachments?.filter((attachment): attachment is FacebookPublishImageAttachment => (
    attachment.type === 'IMAGE'
  )).slice(0, FACEBOOK_MAX_IMAGE_ATTACHMENTS) ?? [];
}

async function reportFacebookPublishResultSafely(
  fallbackAccessToken: string,
  payload: FacebookPublishResultPayload,
) {
  const currentAccessToken = await getAccessToken();
  try {
    await reportFacebookPublishResult(currentAccessToken ?? fallbackAccessToken, payload);
    return null;
  } catch (error) {
    if (error instanceof ApiClientError) {
      return `Backend report failed: ${error.code}: ${error.message}`;
    }

    return `Backend report failed: ${error instanceof Error ? error.message : 'Unknown error.'}`;
  }
}

function withReportMessage(
  payload: FacebookPublishResultPayload,
  reportErrorMessage: string | null,
): FacebookPublishResultPayload {
  if (!reportErrorMessage) return payload;

  return {
    ...payload,
    message: `${payload.message} (${reportErrorMessage})`,
  };
}

function getPublishResultReviewStatus(result: FacebookPagePublishResult): FacebookReviewStatus {
  const message = normalizeFacebookAutomationText(result.message);
  if (
    result.status === 'SUCCESS'
    && /pending|waiting for approval|cho duyet|cho phe duyet|dang cho|quan tri vien phe duyet/.test(message)
  ) {
    return 'PENDING_REVIEW';
  }

  const postUrl = parseFacebookGroupPostUrl(result.externalPostUrl);
  if (postUrl?.pathType === 'pending_posts') return 'PENDING_REVIEW';
  if (postUrl?.pathType === 'posts') return 'POSTED';

  if (
    result.status === 'SUCCESS'
    && /post url.*not.*captured|post url.*could not.*captured|url still needs recovery|requires url confirmation/.test(message)
  ) {
    return 'UNKNOWN';
  }

  if (result.status === 'SUCCESS') {
    return 'POSTED';
  }

  if (
    result.status === 'FAILED'
    && /rejected|declined|not approved|tu choi|khong duoc phe duyet|removed/.test(message)
  ) {
    return 'REJECTED';
  }

  return 'UNKNOWN';
}

function getUnresolvedFacebookReviewStatus(history: FacebookPublishHistoryListItem): FacebookReviewStatus {
  return history.facebookReviewStatus === 'UNKNOWN' ? 'UNKNOWN' : 'PENDING_REVIEW';
}

function normalizeFacebookAutomationText(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd')
    .replace(/\u0110/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function buildFacebookPendingPostsManagerUrl(
  targetUrl: string | null | undefined,
  targetExternalId: string | null | undefined,
) {
  const groupId = getExpectedFacebookGroupIds(targetUrl, targetExternalId)[0] ?? null;
  if (!groupId) return null;
  return `https://www.facebook.com/groups/${encodeURIComponent(groupId)}/my_pending_content`;
}

function buildFacebookGroupUrl(
  targetUrl: string | null | undefined,
  targetExternalId: string | null | undefined,
) {
  const groupId = getExpectedFacebookGroupIds(targetUrl, targetExternalId)[0] ?? null;
  if (!groupId) return null;
  return `https://www.facebook.com/groups/${encodeURIComponent(groupId)}`;
}

async function snapshotTabsForTimestampClick(sourceTabId: number): Promise<FacebookTabClickSnapshot> {
  const sourceTab = await chrome.tabs?.get(sourceTabId).catch(() => null);
  const tabs = await queryTabsForTimestampClick(sourceTab?.windowId);
  return {
    sourceWindowId: sourceTab?.windowId,
    existingTabIds: new Set(tabs.map((tab) => tab.id).filter((id): id is number => id !== undefined)),
  };
}

async function waitForFacebookPostUrlAfterTimestampClick(
  sourceTabId: number,
  targetUrl: string | null | undefined,
  targetExternalId: string | null | undefined,
  snapshot: FacebookTabClickSnapshot,
  timeoutMs: number,
): Promise<FacebookPostUrlDetectionResult> {
  const expectedGroupIds = getExpectedFacebookGroupIds(targetUrl, targetExternalId);
  const openedTabIds = new Set<number>();
  let fallbackDetection: FacebookPostUrlDetectionResult | null = null;
  let latestObservedUrl: string | null = null;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const tabs = await queryTabsForTimestampClick(snapshot.sourceWindowId);
    for (const tab of tabs) {
      if (tab.id === undefined) continue;

      const isSourceTab = tab.id === sourceTabId;
      const isOpenedBySourceTab = tab.openerTabId === sourceTabId;
      const isNewTab = !snapshot.existingTabIds.has(tab.id);
      if (!isSourceTab && !isOpenedBySourceTab && !isNewTab) continue;
      if (isOpenedBySourceTab) openedTabIds.add(tab.id);

      const postUrl = parseFacebookGroupPostUrl(tab.url);
      if (!postUrl) {
        if (tab.url) latestObservedUrl = tab.url;
        continue;
      }

      const matchedExpectedGroup = isExpectedFacebookGroupPostUrl(postUrl, expectedGroupIds);
      const trustedTimestampNavigation = isSourceTab || isOpenedBySourceTab;
      if (!isSourceTab && isOpenedBySourceTab) openedTabIds.add(tab.id);
      const result = {
        postUrl,
        matchedExpectedGroup,
        trustedTimestampNavigation,
        source: isSourceTab ? 'current-tab' : 'new-tab',
        sourceTabId: tab.id,
        observedUrl: tab.url ?? postUrl.url,
        openedTabIds: [...openedTabIds],
        mismatchedPostUrl: matchedExpectedGroup ? null : postUrl,
      } satisfies FacebookPostUrlDetectionResult;

      if (matchedExpectedGroup) return result;
      fallbackDetection = fallbackDetection ?? result;
    }

    await sleep(250);
  }

  if (fallbackDetection) {
    return {
      ...fallbackDetection,
      matchedExpectedGroup: false,
      observedUrl: latestObservedUrl ?? fallbackDetection.postUrl?.url ?? null,
      openedTabIds: [...openedTabIds],
      mismatchedPostUrl: fallbackDetection.postUrl,
    };
  }

  return {
    postUrl: null,
    matchedExpectedGroup: false,
    trustedTimestampNavigation: false,
    source: null,
    observedUrl: latestObservedUrl,
    openedTabIds: [...openedTabIds],
    mismatchedPostUrl: null,
  };
}

async function queryTabsForTimestampClick(windowId: number | undefined) {
  return await chrome.tabs?.query(windowId === undefined ? {} : { windowId }).catch(() => []) ?? [];
}

async function closeAutomationOpenedTabs(tabIds: Iterable<number>, sourceTabId: number) {
  for (const tabId of tabIds) {
    if (tabId !== sourceTabId) await closeTabSafely(tabId);
  }
}

async function activateTabForTimestampRecovery(tabId: number) {
  try {
    const tab = await chrome.tabs?.get(tabId).catch(() => null);
    if (tab?.windowId !== undefined) {
      await chrome.windows?.update(tab.windowId, { focused: true }).catch(() => undefined);
    }
    await activateTab(tabId);
    await waitForTabComplete(tabId);
    await sleep(randomDelay(700, 1_200));
    return null;
  } catch (error) {
    return toAutomationErrorMessage(error);
  }
}

function isExpectedFacebookGroupPostUrl(
  postUrl: ReturnType<typeof parseFacebookGroupPostUrl>,
  expectedGroupIds: string[],
) {
  return Boolean(
    postUrl
      && (expectedGroupIds.length === 0 || expectedGroupIds.includes(postUrl.groupId)),
  );
}

function getExpectedFacebookGroupIds(
  targetUrl: string | null | undefined,
  targetExternalId: string | null | undefined,
) {
  return uniqueNonEmptyStrings([
    getFacebookGroupIdFromUrl(targetUrl),
    normalizeFacebookGroupId(targetExternalId),
  ]);
}

function uniqueNonEmptyStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function getFacebookGroupIdFromUrl(value: string | null | undefined) {
  const rawUrl = value?.trim();
  if (!rawUrl) return null;

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return null;
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  if (hostname !== 'facebook.com' && !hostname.endsWith('.facebook.com')) return null;

  const match = parsedUrl.pathname.match(/^\/groups\/([^/]+)/i);
  return normalizeFacebookGroupId(match?.[1]);
}

function normalizeFacebookGroupId(value: string | null | undefined) {
  const normalized = value ? decodeURIComponent(value).trim().replace(/^\/+|\/+$/g, '') : '';
  return normalized || null;
}

function getTimestampClickPoints(result: FacebookPostReviewStatusProbeResult) {
  const seen = new Set<string>();
  return [
    ...(result.timestampClickPoints ?? []),
    result.timestampClickPoint ?? null,
  ]
    .filter((point): point is FacebookSubmitButtonPoint => Boolean(point))
    .filter((point) => {
      const key = `${point.clientX}:${point.clientY}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function getPostOpenClickPoints(result: FacebookPostReviewStatusProbeResult) {
  const seen = new Set<string>();
  return [
    ...(result.postOpenClickPoints ?? []),
    ...getTimestampClickPoints(result),
  ].filter((point) => {
    const key = `${point.clientX}:${point.clientY}`;
    if (seen.has(key)) return false;
    seen.add(key);
      return true;
  });
}

function addUniqueClickPoints(
  target: FacebookSubmitButtonPoint[],
  points: FacebookSubmitButtonPoint[],
  seen: Set<string>,
) {
  for (const point of points) {
    const key = `${point.clientX}:${point.clientY}`;
    if (seen.has(key)) continue;
    seen.add(key);
    target.push(point);
  }
}

function isTrustedTimestampClickRequiredMessage(message: string) {
  return /trusted (?:timestamp|open-post|facebook) click is required to capture the pending post url/i.test(message);
}

function buildRecoveredPendingPostUrlMessage(result: FacebookPostUrlDetectionResult) {
  const source = result.source === 'new-tab' ? 'a newly opened tab' : 'the pending post tab';
  const groupNote = result.matchedExpectedGroup
    ? ''
    : ' Facebook returned a post URL whose group id differs from the configured group, so it was accepted from the matched pending card.';
  return `Recovered Facebook group post URL by opening the pending post controls in ${source}.${groupNote}`;
}

function buildPendingPostTimestampRecoveryFailureMessage(input: {
  clickPointCount: number;
  expectedGroupIds: string[];
  lastClickErrorMessage: string | null;
  lastDetection: FacebookPostUrlDetectionResult | null;
  lastPageProbeErrorMessage: string | null;
  lastSurfaceProbeMessage: string | null;
  activatedForTimestampClick: boolean;
  activationErrorMessage: string | null;
}) {
  const details = [
    `openCandidates=${input.clickPointCount}`,
    `tabActivated=${input.activatedForTimestampClick}`,
    input.activationErrorMessage ? `activationError="${shortenAutomationMessage(input.activationErrorMessage)}"` : null,
    input.expectedGroupIds.length > 0 ? `expectedGroupIds=${input.expectedGroupIds.join(',')}` : null,
    input.lastClickErrorMessage ? `clickError="${shortenAutomationMessage(input.lastClickErrorMessage)}"` : null,
    input.lastDetection?.observedUrl ? `lastObservedUrl="${shortenAutomationMessage(input.lastDetection.observedUrl, 240)}"` : null,
    input.lastDetection?.mismatchedPostUrl ? `mismatchedPostUrl="${shortenAutomationMessage(input.lastDetection.mismatchedPostUrl.url, 240)}"` : null,
    input.lastDetection ? `trustedNavigation=${input.lastDetection.trustedTimestampNavigation}` : null,
    input.lastDetection?.openedTabIds.length ? `openedTabs=${input.lastDetection.openedTabIds.length}` : null,
    input.lastPageProbeErrorMessage ? `pageProbeError="${shortenAutomationMessage(input.lastPageProbeErrorMessage)}"` : null,
    input.lastSurfaceProbeMessage ? `surfaceProbe="${shortenAutomationMessage(input.lastSurfaceProbeMessage, 420)}"` : null,
  ].filter(Boolean);

  return `Found the matching pending post card, but Facebook did not expose a post URL after opening the matched post controls. ${details.join('; ')}.`;
}

async function openTab(url: string, active: boolean) {
  const tab = await chrome.tabs?.create({ url, active });
  if (!tab?.id) throw new Error('Could not open browser tab.');
  return { id: tab.id };
}

async function waitForTabComplete(tabId: number) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const tab = await chrome.tabs?.get(tabId);
    if (tab?.status === 'complete') return;
    await sleep(500);
  }
}

async function reloadTab(tabId: number) {
  const tab = await chrome.tabs?.get(tabId);
  if (tab?.url) {
    await chrome.tabs?.update(tabId, { url: tab.url });
  }
}

function shouldRetryPrepareFailure(message: string) {
  return /composer|post button|post editor/i.test(message);
}

function isRecoverableTabAutomationFailure(message: string) {
  return /no tab with given id|tab.*closed|target closed|target page|frame was removed|cannot access.*closed|extension context invalidated/i.test(message);
}

function toAutomationErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Facebook browser automation failed.';
}

async function activateTab(tabId: number) {
  await chrome.tabs?.update(tabId, { active: true });
}

async function closeTabSafely(tabId: number) {
  try {
    await chrome.tabs?.remove(tabId);
  } catch {
    // The tab may already be closed by the browser or user.
  }
}

async function closeFacebookPublishTabSafely(tabId: number) {
  if (!chrome.debugger) {
    await closeTabSafely(tabId);
    return;
  }

  const target = { tabId };
  let attached = false;
  const onDebuggerEvent = (
    source: ChromeDebuggee,
    method: string,
    params?: Record<string, unknown>,
  ) => {
    if (source.tabId !== tabId || method !== 'Page.javascriptDialogOpening') return;

    const dialogType = typeof params?.type === 'string' ? params.type : '';
    const message = typeof params?.message === 'string' ? params.message : '';
    const shouldAccept = dialogType === 'beforeunload'
      || /leave site|changes.*not be saved|may not be saved/i.test(message);
    if (!shouldAccept) return;

    void debuggerSendCommand(target, 'Page.handleJavaScriptDialog', { accept: true })
      .catch(() => undefined);
  };

  try {
    await debuggerAttach(target, '1.3');
    attached = true;
    chrome.debugger.onEvent.addListener(onDebuggerEvent);
    await debuggerSendCommand(target, 'Page.enable', {}).catch(() => undefined);

    const closed = await removeTabWithTimeout(tabId, 2_000);
    if (closed || !(await isTabAvailable(tabId))) return;

    await debuggerSendCommand(target, 'Page.handleJavaScriptDialog', { accept: true }).catch(() => undefined);
    await removeTabWithTimeout(tabId, 2_000);
  } catch {
    await closeTabSafely(tabId);
  } finally {
    try {
      chrome.debugger.onEvent.removeListener(onDebuggerEvent);
    } catch {
      // Listener cleanup is best-effort because the extension context may be tearing down.
    }
    if (attached) {
      await debuggerDetach(target).catch(() => undefined);
    }
  }
}

async function removeTabWithTimeout(tabId: number, timeoutMs: number) {
  return Promise.race([
    (chrome.tabs?.remove(tabId) ?? Promise.resolve())
      .then(() => true)
      .catch(async () => !(await isTabAvailable(tabId))),
    sleep(timeoutMs).then(() => false),
  ]);
}

async function isTabAvailable(tabId: number) {
  try {
    await chrome.tabs?.get(tabId);
    return true;
  } catch {
    return false;
  }
}

async function submitPreparedPost(
  tabId: number,
  submitButton: FacebookSubmitButtonPoint,
  content: string,
  targetUrl: string | null | undefined,
  targetExternalId: string | null | undefined,
): Promise<FacebookPagePublishResult> {
  const hiddenResult = await clickAndWaitForSubmission(tabId, submitButton, content, targetUrl, targetExternalId);
  if (
    hiddenResult.status === 'SUCCESS'
    || hiddenResult.submitClickDispatched
    || isRecoverableTabAutomationFailure(hiddenResult.message)
    || !shouldRetryBackgroundSubmitFailure(hiddenResult.message)
  ) {
    return hiddenResult;
  }

  await sleep(randomDelay(500, 1_200));
  return clickAndWaitForSubmission(tabId, submitButton, content, targetUrl, targetExternalId);
}

async function clickAndWaitForSubmission(
  tabId: number,
  submitButton: FacebookSubmitButtonPoint,
  content: string,
  targetUrl: string | null | undefined,
  targetExternalId: string | null | undefined,
): Promise<FacebookPagePublishResult> {
  const preflight = await runScript<[string], FacebookSubmitPreflightResult>(
    tabId,
    verifyFacebookPostReadyToSubmitInPage,
    [content],
  ).catch((error) => ({
    ready: false,
    message: toAutomationErrorMessage(error),
  }));

  if (!preflight.ready) {
    return {
      status: 'FAILED',
      message: preflight.message,
    };
  }

  const tabBeforeClick = await chrome.tabs?.get(tabId).catch(() => null);
  let clickPoint = submitButton;
  try {
    clickPoint = await clickTabPoint(tabId, submitButton);
  } catch (error) {
    return {
      status: 'FAILED',
      message: error instanceof Error ? error.message : 'Facebook submit click failed.',
    };
  }

  try {
    let submissionResult = await runScript<[string, FacebookSubmitDiagnosticInput], FacebookPagePublishResult>(
      tabId,
      waitForFacebookSubmissionInPage,
      [content, {
        targetUrl: targetUrl ?? null,
        targetExternalId: targetExternalId ?? null,
        tabActive: (tabBeforeClick as { active?: boolean } | null)?.active ?? null,
        clickPoint,
      }],
    );
    if (shouldUseHiddenTabSubmitActivationFallback(submissionResult.message)) {
      const activationResult = await runScript<[string], FacebookSubmitActivationResult>(
        tabId,
        activateFacebookSubmitButtonInPage,
        [content],
      ).catch((error): FacebookSubmitActivationResult => ({
        activated: false,
        message: toAutomationErrorMessage(error),
        submitButton: null,
      }));

      if (activationResult.activated) {
        const fallbackResult = await runScript<[string, FacebookSubmitDiagnosticInput], FacebookPagePublishResult>(
          tabId,
          waitForFacebookSubmissionInPage,
          [content, {
            targetUrl: targetUrl ?? null,
            targetExternalId: targetExternalId ?? null,
            tabActive: (tabBeforeClick as { active?: boolean } | null)?.active ?? null,
            clickPoint: activationResult.submitButton ?? clickPoint,
            activationMode: 'dom-click-fallback',
          }],
        );
        submissionResult = fallbackResult.status === 'FAILED'
          ? {
            ...fallbackResult,
            message: `${fallbackResult.message}; fallbackActivation="${shortenAutomationMessage(activationResult.message)}"; firstFailure="${shortenAutomationMessage(submissionResult.message)}"`,
          }
          : fallbackResult;
      } else {
        submissionResult = {
          ...submissionResult,
          message: `${submissionResult.message}; fallbackActivationFailed="${shortenAutomationMessage(activationResult.message)}"`,
        };
      }
    }
    return await enrichFacebookPublishResultWithPostUrl(
      tabId,
      content,
      {
        ...submissionResult,
        submitClickDispatched: true,
      },
      targetUrl,
      targetExternalId,
    );
  } catch (error) {
    return enrichFacebookPublishResultWithPostUrl(
      tabId,
      content,
      {
        status: 'FAILED',
        message: `Facebook post submission could not be observed after submit click. ${toAutomationErrorMessage(error)}`,
        submitClickDispatched: true,
      },
      targetUrl,
      targetExternalId,
    );
  }
}

async function enrichFacebookPublishResultWithPostUrl(
  tabId: number,
  content: string,
  result: FacebookPagePublishResult,
  targetUrl: string | null | undefined,
  targetExternalId: string | null | undefined,
): Promise<FacebookPagePublishResult> {
  const shouldRecoverPostUrl = result.status === 'SUCCESS'
    || (result.submitClickDispatched && isPostClickConfirmationFailure(result.message));
  if (!shouldRecoverPostUrl) return result;

  const existingPostUrl = parseFacebookGroupPostUrl(result.externalPostUrl);
  if (existingPostUrl) {
    return {
      ...result,
      status: 'SUCCESS',
      externalPostId: existingPostUrl.postId,
      externalPostUrl: existingPostUrl.url,
    };
  }

  const currentPageRecovery = await recoverFacebookSubmittedPostUrlInCurrentPage(
    tabId,
    content,
    targetUrl,
    targetExternalId,
    true,
    false,
  );
  const currentPageResult = buildFacebookPublishResultFromRecovery(result, currentPageRecovery);
  if (currentPageResult) return currentPageResult;

  const pendingManagerRecovery = await recoverFacebookSubmittedPostUrlFromPendingManager(
    tabId,
    content,
    targetUrl,
    targetExternalId,
    true,
    false,
  );
  const pendingManagerResult = buildFacebookPublishResultFromRecovery(result, pendingManagerRecovery);
  if (pendingManagerResult) return pendingManagerResult;

  const fallbackPendingRecovery = await recoverFacebookSubmittedPostUrlFromPendingManager(
    tabId,
    content,
    targetUrl,
    targetExternalId,
    false,
    false,
  );
  const fallbackPendingResult = buildFacebookPublishResultFromRecovery(result, fallbackPendingRecovery);
  if (fallbackPendingResult) return fallbackPendingResult;

  const groupFeedRecovery = await recoverFacebookSubmittedPostUrlFromGroupFeed(
    tabId,
    content,
    targetUrl,
    targetExternalId,
    false,
  );
  const groupFeedResult = buildFacebookPublishResultFromRecovery(result, groupFeedRecovery);
  if (groupFeedResult) return groupFeedResult;

  const recoveryMessage = [
    fallbackPendingRecovery.probe?.message,
    groupFeedRecovery.probe?.message,
    pendingManagerRecovery.probe?.message,
    currentPageRecovery.probe?.message,
  ].filter(Boolean).join(' ')
    || 'No matching verified post URL was found.';

  if (
    result.status === 'SUCCESS'
    || (result.submitClickDispatched && result.postClickEvidence && isPostClickConfirmationFailure(result.message))
  ) {
    return {
      ...result,
      status: 'SUCCESS',
      message: `${result.message} Facebook submission appears successful, but the submitted post URL could not be verified. ${recoveryMessage}`,
      externalPostId: null,
      externalPostUrl: null,
      postClickEvidence: true,
    };
  }

  return result;
}

async function recoverFacebookSubmittedPostUrlInCurrentPage(
  tabId: number,
  content: string,
  targetUrl: string | null | undefined,
  targetExternalId: string | null | undefined,
  requireRecent = true,
  allowTabActivation = true,
): Promise<FacebookSubmittedPostRecoveryResult> {
  let lastClickErrorMessage: string | null = null;
  let lastDetection: FacebookPostUrlDetectionResult | null = null;
  let lastPageProbeErrorMessage: string | null = null;
  let lastSurfaceProbeMessage: string | null = null;
  let activationErrorMessage: string | null = null;
  let activatedForTimestampClick = false;
  let lastQueuedClickPointCount = 0;
  const openedTabIdsToClose = new Set<number>();
  const recoverInCurrentPage = async () => runScript<[FacebookPendingPostUrlRecoveryInput], FacebookPostReviewStatusProbeResult>(
    tabId,
    recoverFacebookPendingPostUrlInPage,
    [{
      contentPreview: content,
      targetUrl: targetUrl ?? null,
      targetExternalId: targetExternalId ?? null,
      requireRecent,
    }],
  ).catch((error) => {
    lastPageProbeErrorMessage = toAutomationErrorMessage(error);
    return null;
  });

  let probe: FacebookPostReviewStatusProbeResult | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    probe = await recoverInCurrentPage();
    const postUrl = parseFacebookGroupPostUrl(probe?.externalPostUrl);
    if (postUrl) return { probe, postUrl };

    let postOpenClickPoints = probe ? getPostOpenClickPoints(probe) : [];
    if (allowTabActivation && probe && postOpenClickPoints.length > 0) {
      const clickQueue: FacebookSubmitButtonPoint[] = [];
      const queuedClickPointKeys = new Set<string>();

      addUniqueClickPoints(clickQueue, postOpenClickPoints, queuedClickPointKeys);
      lastQueuedClickPointCount = Math.max(lastQueuedClickPointCount, queuedClickPointKeys.size);

      if (!activatedForTimestampClick && !activationErrorMessage) {
        activationErrorMessage = await activateTabForTimestampRecovery(tabId);
        activatedForTimestampClick = !activationErrorMessage;
        if (activatedForTimestampClick) {
          const activeProbe = await recoverInCurrentPage();
          if (activeProbe) {
            probe = activeProbe;
            const activePostUrl = parseFacebookGroupPostUrl(probe.externalPostUrl);
            if (activePostUrl) return { probe, postUrl: activePostUrl };
            postOpenClickPoints = getPostOpenClickPoints(probe);
            addUniqueClickPoints(clickQueue, postOpenClickPoints, queuedClickPointKeys);
            lastQueuedClickPointCount = Math.max(lastQueuedClickPointCount, queuedClickPointKeys.size);
          }
        }
      }

      for (let clickIndex = 0; clickIndex < clickQueue.length && clickIndex < 8; clickIndex += 1) {
        const clickPoint = clickQueue[clickIndex];
        if (!clickPoint) continue;
        const tabSnapshot = await snapshotTabsForTimestampClick(tabId);
        try {
          await clickTabCoordinatePoint(tabId, clickPoint);
        } catch (error) {
          lastClickErrorMessage = toAutomationErrorMessage(error);
          break;
        }

        const clickedPostUrl = await waitForFacebookPostUrlAfterTimestampClick(
          tabId,
          targetUrl,
          targetExternalId,
          tabSnapshot,
          12_000,
        );
        clickedPostUrl.openedTabIds.forEach((openedTabId) => openedTabIdsToClose.add(openedTabId));
        lastDetection = clickedPostUrl;
        if (
          clickedPostUrl.postUrl
          && (clickedPostUrl.matchedExpectedGroup || clickedPostUrl.trustedTimestampNavigation)
        ) {
          await closeAutomationOpenedTabs(openedTabIdsToClose, tabId);
          return {
            probe: {
              ...probe,
              facebookReviewStatus: clickedPostUrl.postUrl.pathType === 'posts' ? 'POSTED' : 'PENDING_REVIEW',
              message: 'Confirmed Facebook group post URL by opening the submitted post controls.',
              externalPostId: clickedPostUrl.postUrl.postId,
              externalPostUrl: clickedPostUrl.postUrl.url,
            },
            postUrl: clickedPostUrl.postUrl,
          };
        }

        await sleep(randomDelay(700, 1_200));
        const surfaceProbeAfterClick = await runScript<[FacebookPendingPostOpenSurfaceProbeInput], FacebookPendingPostOpenSurfaceProbeResult>(
          tabId,
          inspectFacebookPendingPostOpenSurfaceInPage,
          [{
            contentPreview: content,
            targetUrl: targetUrl ?? null,
            targetExternalId: targetExternalId ?? null,
            requireRecent,
            clickPoint,
          }],
        ).catch((error) => {
          lastSurfaceProbeMessage = toAutomationErrorMessage(error);
          return null;
        });
        if (surfaceProbeAfterClick) {
          lastSurfaceProbeMessage = surfaceProbeAfterClick.diagnostics ?? null;
          const surfacePostUrl = parseFacebookGroupPostUrl(surfaceProbeAfterClick.externalPostUrl);
          if (
            surfacePostUrl
            && (
              isExpectedFacebookGroupPostUrl(surfacePostUrl, getExpectedFacebookGroupIds(targetUrl, targetExternalId))
              || lastDetection?.trustedTimestampNavigation
            )
          ) {
            await closeAutomationOpenedTabs(openedTabIdsToClose, tabId);
            return {
              probe: {
                ...probe,
                facebookReviewStatus: surfacePostUrl.pathType === 'posts' ? 'POSTED' : 'PENDING_REVIEW',
                message: 'Recovered Facebook group post URL from the menu or dialog opened by the submitted post controls.',
                externalPostId: surfacePostUrl.postId,
                externalPostUrl: surfacePostUrl.url,
              },
              postUrl: surfacePostUrl,
            };
          }

          addUniqueClickPoints(clickQueue, surfaceProbeAfterClick.clickPoints ?? [], queuedClickPointKeys);
          lastQueuedClickPointCount = Math.max(lastQueuedClickPointCount, queuedClickPointKeys.size);
        }

        const probeAfterClick = await recoverInCurrentPage();
        if (probeAfterClick) {
          probe = probeAfterClick;
          const openedPostUrl = parseFacebookGroupPostUrl(probe.externalPostUrl);
          if (
            openedPostUrl
            && (
              isExpectedFacebookGroupPostUrl(openedPostUrl, getExpectedFacebookGroupIds(targetUrl, targetExternalId))
              || lastDetection?.trustedTimestampNavigation
            )
          ) {
            await closeAutomationOpenedTabs(openedTabIdsToClose, tabId);
            return { probe, postUrl: openedPostUrl };
          }

          postOpenClickPoints = getPostOpenClickPoints(probe);
          addUniqueClickPoints(clickQueue, postOpenClickPoints, queuedClickPointKeys);
          lastQueuedClickPointCount = Math.max(lastQueuedClickPointCount, queuedClickPointKeys.size);
        }
      }
    }

    if (attempt < 2) {
      await sleep(randomDelay(700, 1_200));
    }
  }

  await closeAutomationOpenedTabs(openedTabIdsToClose, tabId);
  if (probe && isTrustedTimestampClickRequiredMessage(probe.message)) {
    return {
      probe: {
        ...probe,
        message: buildPendingPostTimestampRecoveryFailureMessage({
          clickPointCount: Math.max(lastQueuedClickPointCount, getPostOpenClickPoints(probe).length),
          expectedGroupIds: getExpectedFacebookGroupIds(targetUrl, targetExternalId),
          lastClickErrorMessage,
          lastDetection,
          lastPageProbeErrorMessage,
          lastSurfaceProbeMessage,
          activatedForTimestampClick,
          activationErrorMessage,
        }),
      },
      postUrl: null,
    };
  }

  return { probe, postUrl: null };
}

async function recoverFacebookSubmittedPostUrlFromPendingManager(
  tabId: number,
  content: string,
  targetUrl: string | null | undefined,
  targetExternalId: string | null | undefined,
  requireRecent = true,
  allowTabActivation = true,
): Promise<FacebookSubmittedPostRecoveryResult> {
  const pendingManagerUrl = buildFacebookPendingPostsManagerUrl(targetUrl, targetExternalId);
  if (!pendingManagerUrl) {
    return { probe: null, postUrl: null };
  }

  let latestRecovery: FacebookSubmittedPostRecoveryResult = { probe: null, postUrl: null };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await chrome.tabs?.update(tabId, { url: pendingManagerUrl });
    await waitForTabComplete(tabId);
    await sleep(randomDelay(attempt === 0 ? 2_000 : 3_000, attempt === 0 ? 4_000 : 5_500));

    latestRecovery = await recoverFacebookSubmittedPostUrlInCurrentPage(
      tabId,
      content,
      targetUrl,
      targetExternalId,
      requireRecent,
      allowTabActivation,
    );
    if (latestRecovery.postUrl) return latestRecovery;

    await sleep(randomDelay(900, 1_800));
  }

  if (!requireRecent) {
    return latestRecovery;
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await chrome.tabs?.update(tabId, { url: pendingManagerUrl });
    await waitForTabComplete(tabId);
    await sleep(randomDelay(3_000, 4_500));

    latestRecovery = await recoverFacebookSubmittedPostUrlInCurrentPage(
      tabId,
      content,
      targetUrl,
      targetExternalId,
      false,
      allowTabActivation,
    );
    if (latestRecovery.postUrl) return latestRecovery;

    await sleep(randomDelay(900, 1_500));
  }

  return latestRecovery;
}

async function recoverFacebookSubmittedPostUrlFromGroupFeed(
  tabId: number,
  content: string,
  targetUrl: string | null | undefined,
  targetExternalId: string | null | undefined,
  allowTabActivation = true,
): Promise<FacebookSubmittedPostRecoveryResult> {
  const groupUrl = buildFacebookGroupUrl(targetUrl, targetExternalId);
  if (!groupUrl) {
    return { probe: null, postUrl: null };
  }

  let latestRecovery: FacebookSubmittedPostRecoveryResult = { probe: null, postUrl: null };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await chrome.tabs?.update(tabId, { url: groupUrl });
    await waitForTabComplete(tabId);
    await sleep(randomDelay(1_700, 2_700));
    latestRecovery = await recoverFacebookSubmittedPostUrlInCurrentPage(
      tabId,
      content,
      targetUrl,
      targetExternalId,
      false,
      allowTabActivation,
    );
    if (latestRecovery.postUrl) return latestRecovery;

    await sleep(randomDelay(900, 1_500));
  }

  return latestRecovery;
}

function buildFacebookPublishResultFromRecovery(
  result: FacebookPagePublishResult,
  recovery: FacebookSubmittedPostRecoveryResult,
): FacebookPagePublishResult | null {
  if (recovery.postUrl) {
    return {
      ...result,
      status: 'SUCCESS',
      externalPostId: recovery.postUrl.postId,
      externalPostUrl: recovery.postUrl.url,
      message: recovery.probe?.message || result.message,
      postClickEvidence: true,
    };
  }

  return null;
}

function isPostClickConfirmationFailure(message: string) {
  return /could not be confirmed after submit click|could not be observed after submit click|composer closed after submit|post surface changed after submit|post submission did not complete after clicking|post click was sent|submitted to facebook group|post was submitted after click/i.test(message);
}

function shouldRetryBackgroundSubmitFailure(message: string) {
  return /target closed|target page|cannot access|not activated|post editor is not open before submit|post content is not present before submit|post button is not ready before submit|could not resolve facebook post button before submit/i.test(message);
}

function shouldUseHiddenTabSubmitActivationFallback(message: string) {
  return /^FB_SUBMIT_(BUTTON_STILL_READY|CLICK_POINT_STALE):/.test(message)
    && /visibility=hidden|tabActive=false/.test(message);
}

function shortenAutomationMessage(message: string, maxLength = 360) {
  const normalized = message.replace(/\s+/g, ' ').trim();
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
}

async function runScript<Args extends unknown[], Result>(
  tabId: number,
  func: (...args: Args) => Result | Promise<Result>,
  args: Args,
): Promise<Awaited<Result>> {
  if (!chrome.scripting?.executeScript) {
    throw new Error('Chrome scripting API is unavailable.');
  }

  const [result] = await chrome.scripting.executeScript<Args, Result>({
    target: { tabId },
    func,
    args,
  });

  if (!result) {
    throw new Error(chrome.runtime?.lastError?.message ?? 'Could not execute browser automation script.');
  }

  return result.result as Awaited<Result>;
}

async function clickTabPoint(tabId: number, point: FacebookSubmitButtonPoint): Promise<FacebookSubmitButtonPoint> {
  if (!chrome.debugger) {
    throw new Error('chrome.debugger API is unavailable for Facebook submit click.');
  }

  const target = { tabId };
  await debuggerAttach(target, '1.3');
  let clickPoint = point;
  try {
    await sleep(randomDelay(250, 450));
    const probedPoint = await runScript<[], FacebookSubmitButtonPointProbe>(
      tabId,
      resolveFacebookSubmitButtonPointInPage,
      [],
    ).catch(() => null);
    if (probedPoint && !probedPoint.found) {
      throw new Error('Could not resolve Facebook Post button before submit click.');
    }
    clickPoint = probedPoint?.found && probedPoint.submitButton
      ? probedPoint.submitButton
      : point;

    await debuggerSendCommand(target, 'Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: clickPoint.clientX,
      y: clickPoint.clientY,
    });
    await sleep(randomDelay(120, 260));
    await debuggerSendCommand(target, 'Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: clickPoint.clientX,
      y: clickPoint.clientY,
      button: 'left',
      buttons: 1,
      clickCount: 1,
    });
    await sleep(randomDelay(90, 220));
    await debuggerSendCommand(target, 'Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: clickPoint.clientX,
      y: clickPoint.clientY,
      button: 'left',
      buttons: 0,
      clickCount: 1,
    });
    return clickPoint;
  } finally {
    await debuggerDetach(target).catch(() => undefined);
  }
}

async function clickTabCoordinatePoint(tabId: number, point: FacebookSubmitButtonPoint) {
  if (!chrome.debugger) {
    throw new Error('chrome.debugger API is unavailable for Facebook page coordinate click.');
  }

  const target = { tabId };
  await debuggerAttach(target, '1.3');
  try {
    await debuggerSendCommand(target, 'Page.bringToFront', {}).catch(() => undefined);
    await sleep(randomDelay(120, 240));
    await debuggerSendCommand(target, 'Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: point.clientX,
      y: point.clientY,
    });
    await sleep(randomDelay(90, 180));
    await debuggerSendCommand(target, 'Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: point.clientX,
      y: point.clientY,
      button: 'left',
      buttons: 1,
      clickCount: 1,
    });
    await sleep(randomDelay(80, 180));
    await debuggerSendCommand(target, 'Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: point.clientX,
      y: point.clientY,
      button: 'left',
      buttons: 0,
      clickCount: 1,
    });
  } finally {
    await debuggerDetach(target).catch(() => undefined);
  }
}

function debuggerAttach(target: ChromeDebuggee, requiredVersion: string) {
  return new Promise<void>((resolve, reject) => {
    try {
      chrome.debugger?.attach(target, requiredVersion, () => {
        const lastError = chrome.runtime?.lastError;
        if (lastError?.message) reject(new Error(lastError.message));
        else resolve();
      });
    } catch (error) {
      reject(error);
    }
  });
}

function debuggerSendCommand<T>(
  target: ChromeDebuggee,
  method: string,
  params?: Record<string, unknown>,
) {
  return new Promise<T>((resolve, reject) => {
    try {
      chrome.debugger?.sendCommand<T>(target, method, params, (result) => {
        const lastError = chrome.runtime?.lastError;
        if (lastError?.message) reject(new Error(lastError.message));
        else resolve(result);
      });
    } catch (error) {
      reject(error);
    }
  });
}

function debuggerDetach(target: ChromeDebuggee) {
  return new Promise<void>((resolve, reject) => {
    try {
      chrome.debugger?.detach(target, () => {
        const lastError = chrome.runtime?.lastError;
        if (lastError?.message) reject(new Error(lastError.message));
        else resolve();
      });
    } catch (error) {
      reject(error);
    }
  });
}

function randomDelay(minMs: number, maxMs: number) {
  const min = Math.max(0, minMs);
  const max = Math.max(min, maxMs);
  return Math.round(min + Math.random() * (max - min));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function checkFacebookLoginInPage(): FacebookLoginCheckResult {
  const url = window.location.href;
  const loginLike = /\/login|checkpoint|recover|confirmemail|two_step|login_identify/i.test(url);
  const hasPasswordInput = Boolean(document.querySelector('input[type="password"]'));
  const bodyText = (document.body?.innerText ?? '').toLowerCase().slice(0, 3000);
  const loggedOutText = /log in|login|dang nhap/.test(bodyText) && hasPasswordInput;
  const ready = url.includes('facebook.com') && !loginLike && !loggedOutText;

  return {
    ready,
    url,
    message: ready
      ? 'Facebook login detected.'
      : 'Waiting for Facebook login to complete.',
  };
}

async function checkFacebookGroupPostingEligibilityInPage(): Promise<FacebookGroupEligibilityResult> {
  const sleepInPage = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const normalize = (value: string) => value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd')
    .replace(/\u0110/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  const CLICKABLE_SELECTOR = 'button, [role="button"], [tabindex], a, span, div';
  const POST_COMPOSER_PATTERNS = [
    /write something/,
    /create a public post/,
    /create post/,
    /start a post/,
    /what.?s on your mind/,
    /ban viet gi/,
    /viet gi/,
    /tao bai viet/,
  ];
  const COMMENT_PATTERNS = [
    /write a comment/,
    /add a comment/,
    /comment as/,
    /reply/,
    /binh luan/,
    /viet binh luan/,
    /tra loi/,
    /viet phan hoi/,
  ];
  const JOIN_GROUP_PATTERNS = [
    /^join$/,
    /^join group$/,
    /^join this group$/,
    /^tham gia$/,
    /^tham gia nhom$/,
    /request to join/,
    /yeu cau tham gia/,
  ];
  const PENDING_JOIN_PATTERNS = [
    /^pending$/,
    /^request pending$/,
    /^requested$/,
    /cancel request/,
    /membership pending/,
    /^dang cho$/,
    /dang cho phe duyet/,
    /da gui yeu cau/,
  ];
  const queryAll = (root: Document | Element, selector: string) => (
    Array.from(root.querySelectorAll(selector))
  );
  const isVisible = (element: Element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0
      && rect.height > 0
      && style.visibility !== 'hidden'
      && style.display !== 'none';
  };
  const elementLabel = (element: Element) => normalize([
    element.textContent ?? '',
    element.getAttribute('aria-label') ?? '',
    element.getAttribute('aria-placeholder') ?? '',
    element.getAttribute('placeholder') ?? '',
    element.getAttribute('title') ?? '',
  ].join(' '));
  const matchesAny = (label: string, patterns: RegExp[]) => patterns.some((pattern) => pattern.test(label));
  const getClickableElement = (element: Element) => (
    element.closest('button, [role="button"], [tabindex], a') ?? element
  );
  const isDisabled = (element: Element) => {
    const clickable = getClickableElement(element);
    return clickable.hasAttribute('disabled')
      || clickable.getAttribute('aria-disabled') === 'true';
  };
  const isCommentLabel = (label: string) => matchesAny(label, COMMENT_PATTERNS);
  const isInsideCommentSurface = (element: Element) => {
    if (isCommentLabel(elementLabel(element))) return true;

    let current = element.parentElement;
    let depth = 0;
    while (current && depth < 6) {
      const label = elementLabel(current);
      if (matchesAny(label, POST_COMPOSER_PATTERNS)) return false;
      if (isCommentLabel(label)) return true;
      current = current.parentElement;
      depth += 1;
    }

    return false;
  };
  const result = (
    eligibilityStatus: FacebookGroupEligibilityResult['eligibilityStatus'],
    eligibilityReason: string,
  ): FacebookGroupEligibilityResult => ({
    eligibilityStatus,
    eligibilityReason,
    verifiedAt: new Date().toISOString(),
  });
  const clickElement = async (element: Element) => {
    const clickable = getClickableElement(element);
    clickable.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
    if (clickable instanceof HTMLElement) {
      clickable.focus({ preventScroll: true });
    }
    await sleepInPage(150);
    (clickable as HTMLElement).click();
  };
  const findClickable = (
    root: Document | Element,
    patterns: RegExp[],
    options: {
      enabledOnly?: boolean;
      excludeCommentSurfaces?: boolean;
      maxLabelLength?: number;
      preferViewport?: boolean;
    } = {},
  ) => {
    const matched = queryAll(root, CLICKABLE_SELECTOR)
      .filter((element) => {
        if (!isVisible(element)) return false;
        if (options.enabledOnly && isDisabled(element)) return false;
        if (options.excludeCommentSurfaces && isInsideCommentSurface(element)) return false;
        const label = elementLabel(element);
        if (!label || label.length > (options.maxLabelLength ?? 180)) return false;
        return matchesAny(label, patterns);
      });
    const sorted = options.preferViewport
      ? matched
        .map((element) => {
          const clickable = getClickableElement(element);
          const rect = clickable.getBoundingClientRect();
          const label = elementLabel(element);
          const inViewport = rect.bottom > 0 && rect.top < window.innerHeight;
          const nearTop = inViewport && rect.top < window.innerHeight * 0.85;
          const role = clickable.getAttribute('role');
          const roleScore = clickable.tagName === 'BUTTON' || role === 'button' ? 90 : 0;
          const conciseLabelScore = label.length <= 80 ? 70 : label.length <= 140 ? 30 : 0;
          const areaPenalty = Math.min(90, (rect.width * rect.height) / 1600);
          return {
            element,
            score: roleScore
              + conciseLabelScore
              + (inViewport ? 100 : 0)
              + (nearTop ? 40 : 0)
              - areaPenalty
              - Math.max(0, rect.top / 100),
          };
        })
        .sort((left, right) => right.score - left.score)
        .map((item) => item.element)
      : matched;

    return {
      element: sorted[0] ?? null,
      elements: sorted,
      count: matched.length,
    };
  };
  const findPostEditor = (root: Document | Element) => queryAll(
    root,
    '[contenteditable="true"][role="textbox"], [contenteditable="true"]',
  )
    .filter((element): element is HTMLElement => element instanceof HTMLElement)
    .filter((element) => isVisible(element))
    .filter((element) => !isInsideCommentSurface(element))
    .find((element) => {
      const label = elementLabel(element);
      return matchesAny(label, POST_COMPOSER_PATTERNS) || Boolean(element.closest('[role="dialog"]'));
    }) ?? null;
  const waitForPostEditor = async (timeoutMs: number) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const dialogs = queryAll(document, '[role="dialog"]')
        .filter((element) => isVisible(element))
        .filter((element) => !isInsideCommentSurface(element));
      const dialogEditor = dialogs
        .map((dialog) => findPostEditor(dialog))
        .find((element): element is HTMLElement => Boolean(element));
      if (dialogEditor) return dialogEditor;

      const inlineEditor = findPostEditor(document);
      if (inlineEditor) return inlineEditor;

      await sleepInPage(400);
    }

    return null;
  };

  if (/\/login|checkpoint|recover|confirmemail|two_step|login_identify/i.test(window.location.href)) {
    return result('CANNOT_POST', 'Facebook login or checkpoint is required.');
  }

  await sleepInPage(1_000);
  const visibleText = normalize(document.body?.innerText ?? '');
  if (
    /content isn.?t available|this content isn.?t available|you can.?t post|not allowed to post/.test(visibleText)
    || /ban hien khong xem duoc noi dung nay|khong co quyen|khong the dang|noi dung nay hien khong co san/.test(visibleText)
  ) {
    return result('CANNOT_POST', 'Current Facebook account cannot access or post to this group.');
  }

  const pendingJoin = findClickable(document, PENDING_JOIN_PATTERNS, { maxLabelLength: 80 });
  if (pendingJoin.element) {
    return result('CANNOT_POST', 'Current Facebook account has a pending join request for this group.');
  }

  const joinButton = findClickable(document, JOIN_GROUP_PATTERNS, { enabledOnly: true, maxLabelLength: 80 });
  if (joinButton.element) {
    return result('CANNOT_POST', 'Current Facebook account has not joined this group.');
  }

  window.scrollTo({ top: 0, behavior: 'auto' });
  await sleepInPage(700);

  const existingEditor = await waitForPostEditor(1_000);
  if (existingEditor) {
    return result('CAN_POST', 'Current Facebook account can open the group composer.');
  }

  const composer = findClickable(document, POST_COMPOSER_PATTERNS, {
    enabledOnly: true,
    excludeCommentSurfaces: true,
    maxLabelLength: 180,
    preferViewport: true,
  });
  if (!composer.element) {
    return result(
      'UNKNOWN',
      `Could not verify Facebook group composer automatically. url=${window.location.href}; composerMatches=${composer.count}; bodyLength=${visibleText.length}.`,
    );
  }

  const candidates = composer.elements.slice(0, 5);
  for (const candidate of candidates) {
    await clickElement(candidate);
    const editor = await waitForPostEditor(6_000);
    if (editor) {
      return result('CAN_POST', 'Current Facebook account can open the group composer.');
    }

    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape',
      code: 'Escape',
      bubbles: true,
      cancelable: true,
    }));
    await sleepInPage(500);
  }

  return result(
    'CAN_POST',
    `Current Facebook account can see an enabled group composer. url=${window.location.href}; composerMatches=${composer.count}; testedCandidates=${candidates.length}.`,
  );
}

async function prepareFacebookPostInPage(
  content: string,
  imageAttachments: FacebookPublishImageAttachment[] = [],
): Promise<FacebookPreparedPostResult> {
  const sleepInPage = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const normalize = (value: string) => value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd')
    .replace(/\u0110/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  const CLICKABLE_SELECTOR = 'button, [role="button"], [tabindex], a, span, div';
  const POST_COMPOSER_PATTERNS = [
    /write something/,
    /create a public post/,
    /create post/,
    /start a post/,
    /what.?s on your mind/,
    /ban viet gi/,
    /viet gi/,
    /tao bai viet/,
  ];
  const POST_BUTTON_PATTERNS = [
    /^post$/,
    /^dang$/,
    /^post post$/,
    /^dang dang$/,
    /^post to group$/,
    /^dang bai$/,
    /^dang tin$/,
    /^dang len nhom$/,
    /^dang vao nhom$/,
  ];
  const IMAGE_PICKER_PATTERNS = [
    /photo\/video/,
    /photos\/videos/,
    /add photo/,
    /add photos/,
    /add photo\/video/,
    /photo or video/,
    /^photo$/,
    /^photos$/,
    /anh\/video/,
    /anh video/,
    /them anh/,
    /them anh\/video/,
    /them anh video/,
    /^anh$/,
  ];
  const COMMENT_PATTERNS = [
    /write a comment/,
    /add a comment/,
    /comment as/,
    /reply/,
    /binh luan/,
    /viet binh luan/,
    /tra loi/,
    /viet phan hoi/,
  ];
  const CHAT_SURFACE_PATTERNS = [
    /messenger/,
    /^chats?$/,
    /chat/,
    /message/,
    /write a message/,
    /nhap tin nhan/,
    /tin nhan/,
    /doan chat/,
    /cuoc tro chuyen/,
    /goi thoai/,
    /goi video/,
    /voice call/,
    /video call/,
    /minimize chat/,
    /close chat/,
    /dong doan chat/,
    /thu nho/,
    /dang hoat dong/,
    /active now/,
  ];
  const CHAT_EDITOR_PATTERNS = [
    /^aa$/,
    /write a message/,
    /nhap tin nhan/,
    /message/,
    /tin nhan/,
  ];
  const queryAll = (root: Document | Element, selector: string) => (
    Array.from(root.querySelectorAll(selector))
  );
  const isVisible = (element: Element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0
      && rect.height > 0
      && style.visibility !== 'hidden'
      && style.display !== 'none';
  };
  const elementLabel = (element: Element) => normalize([
    element.textContent ?? '',
    element.getAttribute('aria-label') ?? '',
    element.getAttribute('aria-placeholder') ?? '',
    element.getAttribute('placeholder') ?? '',
    element.getAttribute('title') ?? '',
  ].join(' '));
  const elementAttributeLabel = (element: Element) => normalize([
    element.getAttribute('aria-label') ?? '',
    element.getAttribute('aria-placeholder') ?? '',
    element.getAttribute('placeholder') ?? '',
    element.getAttribute('title') ?? '',
  ].join(' '));
  const matchesAny = (label: string, patterns: RegExp[]) => patterns.some((pattern) => pattern.test(label));
  const isSubmitLabel = (label: string) => matchesAny(label, POST_BUTTON_PATTERNS);
  const isCommentLabel = (label: string) => matchesAny(label, COMMENT_PATTERNS);
  const isChatEditor = (element: Element) => {
    const attributeLabel = elementAttributeLabel(element);
    const shortText = normalize((element.textContent ?? '').trim());
    return matchesAny(attributeLabel, CHAT_EDITOR_PATTERNS)
      || shortText === 'aa';
  };
  const hasChatControls = (root: Document | Element) => queryAll(
    root,
    '[aria-label], [title], button, [role="button"]',
  )
    .some((element) => matchesAny(elementAttributeLabel(element), CHAT_SURFACE_PATTERNS));
  const isDockedChatLikeSurface = (element: Element) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 180
      && rect.width <= 560
      && rect.height > 80
      && rect.height <= Math.max(640, window.innerHeight * 0.9)
      && rect.bottom >= window.innerHeight - 12
      && rect.right >= window.innerWidth * 0.45
      && hasChatControls(element);
  };
  const isChatSurface = (element: Element) => {
    const attributeLabel = elementAttributeLabel(element);
    const text = normalize((element.textContent ?? '').trim());
    const compactText = text.length <= 80 ? text : '';
    return isChatEditor(element)
      || matchesAny(attributeLabel, CHAT_SURFACE_PATTERNS)
      || /^aa$|dang hoat dong|active now|doan chat|cuoc tro chuyen/.test(compactText)
      || isDockedChatLikeSurface(element);
  };
  const getClickableElement = (element: Element) => (
    element.closest('button, [role="button"], [tabindex], a') ?? element
  );
  const isDisabled = (element: Element) => {
    const clickable = getClickableElement(element);
    return clickable.hasAttribute('disabled')
      || clickable.getAttribute('aria-disabled') === 'true';
  };
  const isInsideCommentSurface = (element: Element) => {
    if (isCommentLabel(elementLabel(element)) || isChatSurface(element)) return true;

    let current = element.parentElement;
    let depth = 0;
    while (current && depth < 9) {
      const label = elementLabel(current);
      if (matchesAny(label, POST_COMPOSER_PATTERNS)) return false;
      if (isCommentLabel(label) || isChatSurface(current)) return true;
      current = current.parentElement;
      depth += 1;
    }

    return false;
  };
  const resolveClickPoint = (element: Element) => {
    const clickable = getClickableElement(element);
    const rect = clickable.getBoundingClientRect();
    const candidates = [
      [0.5, 0.5],
      [0.15, 0.5],
      [0.85, 0.5],
      [0.5, 0.25],
      [0.5, 0.75],
      [0.15, 0.25],
      [0.85, 0.25],
      [0.15, 0.75],
      [0.85, 0.75],
    ];

    for (const [xRatio, yRatio] of candidates) {
      const clientX = Math.round(rect.left + rect.width * xRatio);
      const clientY = Math.round(rect.top + rect.height * yRatio);
      const hit = document.elementFromPoint(clientX, clientY);
      const hitClickable = hit?.closest?.('button, [role="button"], [tabindex], a');
      if (hit && (hit === clickable || clickable.contains(hit) || hitClickable === clickable)) {
        return { clientX, clientY };
      }
    }

    return {
      clientX: Math.round(rect.left + rect.width / 2),
      clientY: Math.round(rect.top + rect.height / 2),
    };
  };
  const isUsableClickPoint = (element: Element) => {
    const point = resolveClickPoint(element);
    const clickable = getClickableElement(element);
    const hit = document.elementFromPoint(point.clientX, point.clientY);
    const hitClickable = hit?.closest?.('button, [role="button"], [tabindex], a');
    return Boolean(hit && (hit === clickable || clickable.contains(hit) || hitClickable === clickable));
  };
  const clickElement = async (element: Element) => {
    const clickable = getClickableElement(element);
    clickable.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
    if (clickable instanceof HTMLElement) {
      clickable.focus({ preventScroll: true });
    }
    await sleepInPage(150);

    (clickable as HTMLElement).click();
  };
  const findClickable = (
    root: Document | Element,
    patterns: RegExp[],
    options: {
      enabledOnly?: boolean;
      excludeCommentSurfaces?: boolean;
      maxLabelLength?: number;
      preferViewport?: boolean;
    } = {},
  ) => {
    const elements = queryAll(root, CLICKABLE_SELECTOR);
    const candidates = elements.filter((element) => {
      if (!isVisible(element)) return false;
      if (options.enabledOnly && isDisabled(element)) return false;
      if (options.excludeCommentSurfaces && isInsideCommentSurface(element)) return false;
      const label = elementLabel(element);
      if (!label || label.length > (options.maxLabelLength ?? 160)) return false;
      return matchesAny(label, patterns);
    });

    if (!options.preferViewport) return candidates[0] ?? null;

    return candidates
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const label = elementLabel(element);
        const inViewport = rect.bottom > 0 && rect.top < window.innerHeight;
        const nearTop = inViewport && rect.top < window.innerHeight * 0.85;
        const clickable = getClickableElement(element);
        const role = clickable.getAttribute('role');
        const roleScore = clickable.tagName === 'BUTTON' || role === 'button' ? 90 : 0;
        const conciseLabelScore = label.length <= 80 ? 70 : label.length <= 140 ? 30 : 0;
        const areaPenalty = Math.min(90, (rect.width * rect.height) / 1600);
        return {
          element,
          score: roleScore
            + conciseLabelScore
            + (inViewport ? 100 : 0)
            + (nearTop ? 40 : 0)
            - areaPenalty
            - Math.max(0, rect.top / 100),
        };
      })
      .sort((left, right) => right.score - left.score)[0]?.element ?? null;
  };
  const findPostSubmitButton = (root: Document | Element) => {
    const uniqueClickables = new Set<Element>();

    return queryAll(root, CLICKABLE_SELECTOR)
      .map((element) => ({
        source: element,
        clickable: getClickableElement(element),
      }))
      .filter(({ source, clickable }) => {
        if (uniqueClickables.has(clickable)) return false;
        uniqueClickables.add(clickable);
        if (!isVisible(clickable) || isDisabled(clickable) || isInsideCommentSurface(source)) return false;
        const labels = [elementLabel(source), elementLabel(clickable)].filter(Boolean);
        return labels.some(isSubmitLabel);
      })
      .map(({ source, clickable }) => {
        const rect = clickable.getBoundingClientRect();
        const label = elementLabel(clickable) || elementLabel(source);
        const role = clickable.getAttribute('role');
        const inDialog = Boolean(clickable.closest('[role="dialog"]'));
        const exactSubmitScore = /^post$|^dang$/.test(label) ? 100 : 40;
        const roleScore = clickable.tagName === 'BUTTON' || role === 'button' ? 80 : 0;
        const conciseLabelScore = label.length <= 40 ? 50 : label.length <= 80 ? 20 : -50;
        const viewportScore = rect.bottom > 0 && rect.top < window.innerHeight ? 30 : 0;
        const hitScore = isUsableClickPoint(clickable) ? 40 : -120;

        return {
          element: clickable,
          score: exactSubmitScore
            + roleScore
            + conciseLabelScore
            + viewportScore
            + hitScore
            + (inDialog ? 60 : 0)
            - Math.min(60, (rect.width * rect.height) / 1800),
        };
      })
      .sort((left, right) => right.score - left.score)[0]?.element ?? null;
  };
  const hasPostSubmitControl = (root: Document | Element) => {
    const uniqueClickables = new Set<Element>();

    return queryAll(root, CLICKABLE_SELECTOR)
      .map((element) => ({
        source: element,
        clickable: getClickableElement(element),
      }))
      .some(({ source, clickable }) => {
        if (uniqueClickables.has(clickable)) return false;
        uniqueClickables.add(clickable);
        if (!isVisible(clickable) || isInsideCommentSurface(source)) return false;
        const labels = [elementLabel(source), elementLabel(clickable)].filter(Boolean);
        return labels.some(isSubmitLabel);
      });
  };
  const hasPostComposerCue = (root: Document | Element) => {
    const rootElement = root instanceof Document ? root.body : root;
    if (rootElement && matchesAny(elementLabel(rootElement), POST_COMPOSER_PATTERNS)) return true;

    return queryAll(root, '[aria-label], [aria-placeholder], [placeholder], [title]')
      .some((element) => matchesAny(elementAttributeLabel(element), POST_COMPOSER_PATTERNS));
  };
  const findPostSurfaceForEditor = (editor: HTMLElement): Element | null => {
    if (isInsideCommentSurface(editor)) return null;

    let current = editor.parentElement;
    let depth = 0;
    while (current && current !== document.body && depth < 10) {
      if (isInsideCommentSurface(current)) return null;

      const hasComposerCue = hasPostComposerCue(current);
      const hasSubmitControl = hasPostSubmitControl(current);
      const isDialog = current.getAttribute('role') === 'dialog';
      if (
        (hasComposerCue && (hasSubmitControl || isDialog))
        || (isDialog && hasSubmitControl)
      ) {
        return current;
      }

      current = current.parentElement;
      depth += 1;
    }

    return null;
  };
  const getPostEditorSafetyMessage = (editor: HTMLElement) => {
    if (isInsideCommentSurface(editor)) {
      return 'Detected Messenger/chat editor; aborting to avoid pasting post content into chat.';
    }

    if (!findPostSurfaceForEditor(editor)) {
      return 'Could not verify Facebook post composer before inserting content.';
    }

    return null;
  };
  const findPostEditor = (root: Document | Element) => {
    const editors = queryAll(root, '[contenteditable="true"][role="textbox"], [contenteditable="true"]')
      .filter((element): element is HTMLElement => element instanceof HTMLElement)
      .filter((element) => isVisible(element))
      .map((element) => ({
        element,
        surface: findPostSurfaceForEditor(element),
      }))
      .filter((candidate): candidate is { element: HTMLElement; surface: Element } => Boolean(candidate.surface));

    return editors
      .map(({ element, surface }) => {
        const rect = element.getBoundingClientRect();
        const label = elementLabel(element);
        const surfaceLabel = elementLabel(surface);
        const roleScore = element.getAttribute('role') === 'textbox' ? 40 : 0;
        const composerScore = matchesAny(label, POST_COMPOSER_PATTERNS)
          || matchesAny(surfaceLabel, POST_COMPOSER_PATTERNS)
          ? 80
          : 0;
        const submitScore = hasPostSubmitControl(surface) ? 50 : 0;
        const dialogScore = surface.getAttribute('role') === 'dialog' ? 30 : 0;
        const areaScore = Math.min(60, (rect.width * rect.height) / 2500);
        return {
          element,
          score: roleScore + composerScore + submitScore + dialogScore + areaScore,
        };
      })
      .sort((left, right) => right.score - left.score)[0]?.element ?? null;
  };
  const findInlineComposerSurface = (editor: HTMLElement): Document | Element => {
    let current = editor.parentElement;
    let depth = 0;

    while (current && depth < 8) {
      if (!isInsideCommentSurface(current) && (hasPostSubmitControl(current) || hasPostComposerCue(current))) {
        return current;
      }

      current = current.parentElement;
      depth += 1;
    }

    return editor.parentElement ?? document;
  };
  const waitForPostSurface = async (timeoutMs: number): Promise<Document | Element | null> => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const dialogs = queryAll(document, '[role="dialog"]')
        .filter((element) => isVisible(element))
        .filter((element) => !isInsideCommentSurface(element));
      const dialogWithEditor = dialogs.find((dialog) => findPostEditor(dialog));
      if (dialogWithEditor) return dialogWithEditor;

      const editor = findPostEditor(document);
      if (editor) return findPostSurfaceForEditor(editor) ?? findInlineComposerSurface(editor);

      await sleepInPage(400);
    }
    return null;
  };
  const findPostComposer = () => findClickable(document, POST_COMPOSER_PATTERNS, {
    enabledOnly: true,
    excludeCommentSurfaces: true,
    maxLabelLength: 180,
    preferViewport: true,
  });
  const openPostSurface = async (
    timeoutMs: number,
  ): Promise<{ surface: Document | Element | null; composerSeen: boolean }> => {
    const deadline = Date.now() + timeoutMs;
    let composerSeen = false;

    while (Date.now() < deadline) {
      const existingSurface = await waitForPostSurface(500);
      if (existingSurface) return { surface: existingSurface, composerSeen: true };

      const composer = findPostComposer();
      if (!composer) {
        await sleepInPage(800);
        continue;
      }

      composerSeen = true;
      await clickElement(composer);

      const openedSurface = await waitForPostSurface(2_500);
      if (openedSurface) return { surface: openedSurface, composerSeen };

      await sleepInPage(800 + Math.random() * 1_200);
    }

    return { surface: null, composerSeen };
  };
  const waitForPostButton = async (
    surface: Document | Element,
    timeoutMs: number,
  ): Promise<Element | null> => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const button = findClickable(surface, POST_BUTTON_PATTERNS, {
        enabledOnly: true,
        excludeCommentSurfaces: true,
        maxLabelLength: 80,
      }) ?? findPostSubmitButton(surface);
      if (button) return button;
      await sleepInPage(500);
    }

    return null;
  };
  const buildSubmitButtonPoint = async (submitButton: Element): Promise<FacebookSubmitButtonPoint> => {
    const clickableButton = getClickableElement(submitButton);
    clickableButton.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
    await sleepInPage(150);
    const clickPoint = resolveClickPoint(submitButton);
    const rect = clickableButton.getBoundingClientRect();

    return {
      clientX: clickPoint.clientX,
      clientY: clickPoint.clientY,
      label: elementLabel(submitButton),
      rect: {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
    };
  };
  const surfaceContains = (surfaceRoot: Document | Element, element: Element) => (
    surfaceRoot instanceof Document ? surfaceRoot.contains(element) : surfaceRoot.contains(element)
  );
  const MEDIA_SELECTOR = 'img[src^="blob:"], img[src^="data:"], img[src*="fbcdn"], video, [role="img"]';
  const getMediaElements = (root: Document | Element) => queryAll(root, MEDIA_SELECTOR)
    .filter((element) => isVisible(element))
    .filter((element) => !isInsideCommentSurface(element));
  const getMediaFingerprint = (element: Element) => [
    element.tagName,
    element.getAttribute('src') ?? '',
    element.getAttribute('poster') ?? '',
    element.getAttribute('style') ?? '',
    element.getAttribute('role') ?? '',
  ].join('|');
  const getSurfaceMediaCount = (surfaceRoot: Document | Element) => getMediaElements(surfaceRoot).length;
  const getVisibleSurfaceText = (surfaceRoot: Document | Element) => normalize(
    surfaceRoot instanceof Document ? (surfaceRoot.body?.innerText ?? '') : (surfaceRoot.textContent ?? ''),
  );
  const hasUploadBusyCue = (surfaceRoot: Document | Element) => {
    const text = getVisibleSurfaceText(surfaceRoot);
    if (/uploading|processing|dang tai|dang xu ly|dang tai len|upload/.test(text)) return true;

    return queryAll(surfaceRoot, '[role="progressbar"], [aria-busy="true"]')
      .some((element) => isVisible(element));
  };
  const hasUploadErrorCue = (surfaceRoot: Document | Element) => {
    const text = getVisibleSurfaceText(surfaceRoot);
    return /couldn.?t upload|upload failed|try again|khong tai duoc|tai len that bai|thu lai/.test(text);
  };
  const getImageInputs = () => queryAll(document, 'input[type="file"]')
    .filter((element): element is HTMLInputElement => element instanceof HTMLInputElement)
    .filter((input) => {
      const accept = normalize(input.accept ?? '');
      return !accept
        || accept.includes('image')
        || accept.includes('jpg')
        || accept.includes('jpeg')
        || accept.includes('png')
        || accept.includes('webp')
        || accept.includes('heic');
    });
  const findBestImageInput = (
    surfaceRoot: Document | Element,
    knownInputs: Set<HTMLInputElement>,
    allowExistingGlobalInput = false,
  ) => {
    const inputs = getImageInputs();
    const newInputs = inputs.filter((input) => !knownInputs.has(input));
    return newInputs.find((input) => surfaceContains(surfaceRoot, input))
      ?? newInputs[0]
      ?? inputs.find((input) => surfaceContains(surfaceRoot, input))
      ?? (allowExistingGlobalInput ? inputs[inputs.length - 1] : null)
      ?? null;
  };
  const makeImageFile = async (attachment: FacebookPublishImageAttachment) => {
    const response = await fetch(attachment.dataUrl);
    if (!response.ok) {
      throw new Error(`Could not decode image data (${response.status}).`);
    }
    const blob = await response.blob();
    return new File([blob], attachment.fileName || 'facebook-image', {
      type: attachment.mimeType || blob.type || 'image/jpeg',
      lastModified: Date.now(),
    });
  };
  const waitForImageAttachmentAccepted = async (
    surfaceRoot: Document | Element,
    initialMediaCount: number,
    expectedAttachmentCount: number,
    baselinePageMedia: Set<Element>,
    baselinePageMediaFingerprints: Set<string>,
    timeoutMs: number,
  ) => {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      if (hasUploadErrorCue(surfaceRoot)) {
        return false;
      }

      const mediaCount = getSurfaceMediaCount(surfaceRoot);
      const newPageMediaCount = getMediaElements(document)
        .filter((element) => (
          !baselinePageMedia.has(element)
          || !baselinePageMediaFingerprints.has(getMediaFingerprint(element))
        )).length;
      if (
        (
          mediaCount >= initialMediaCount + expectedAttachmentCount
          || newPageMediaCount >= expectedAttachmentCount
        )
        && !hasUploadBusyCue(surfaceRoot)
      ) {
        return true;
      }

      await sleepInPage(500);
    }

    const newPageMediaCount = getMediaElements(document)
      .filter((element) => (
        !baselinePageMedia.has(element)
        || !baselinePageMediaFingerprints.has(getMediaFingerprint(element))
      )).length;
    return getSurfaceMediaCount(surfaceRoot) >= initialMediaCount + expectedAttachmentCount
      || newPageMediaCount >= expectedAttachmentCount;
  };
  const attachImagesToComposer = async (
    surfaceRoot: Document | Element,
    attachments: FacebookPublishImageAttachment[],
  ): Promise<{ ok: true } | { ok: false; message: string }> => {
    try {
      const knownInputs = new Set(getImageInputs());
      const initialMediaCount = getSurfaceMediaCount(surfaceRoot);
      const baselinePageMedia = new Set(getMediaElements(document));
      const baselinePageMediaFingerprints = new Set(
        getMediaElements(document).map(getMediaFingerprint),
      );
      let input = findBestImageInput(surfaceRoot, knownInputs);

      if (!input) {
        const imageButton = findClickable(surfaceRoot, IMAGE_PICKER_PATTERNS, {
          enabledOnly: true,
          excludeCommentSurfaces: true,
          maxLabelLength: 140,
          preferViewport: true,
        });
        if (!imageButton) {
          return {
            ok: false,
            message: 'Could not find Facebook Photo/Video control in the verified composer.',
          };
        }

        await clickElement(imageButton);
        const inputDeadline = Date.now() + 8_000;
        while (Date.now() < inputDeadline) {
          input = findBestImageInput(surfaceRoot, knownInputs, true);
          if (input) break;
          await sleepInPage(300);
        }
      }

      if (!input) {
        return {
          ok: false,
          message: 'Facebook Photo/Video control opened, but no image file input was exposed.',
        };
      }

      const imageFiles = await Promise.all(attachments.map(makeImageFile));
      if (imageFiles.length > 1 && !input.multiple) {
        input.multiple = true;
        input.setAttribute('multiple', '');
      }
      const dataTransfer = new DataTransfer();
      imageFiles.forEach((imageFile) => dataTransfer.items.add(imageFile));
      input.files = dataTransfer.files;
      if ((input.files?.length ?? 0) < imageFiles.length) {
        return {
          ok: false,
          message: `Facebook image input accepted only ${input.files?.length ?? 0}/${imageFiles.length} file(s).`,
        };
      }
      input.focus({ preventScroll: true });
      input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));

      const accepted = await waitForImageAttachmentAccepted(
        surfaceRoot,
        initialMediaCount,
        attachments.length,
        baselinePageMedia,
        baselinePageMediaFingerprints,
        30_000,
      );
      if (!accepted) {
        return {
          ok: false,
          message: `Facebook did not confirm ${attachments.length} uploaded image(s) in the composer before timeout.`,
        };
      }

      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'Facebook image attachment failed.',
      };
    }
  };
  const insertContent = async (editor: HTMLElement) => {
    const safetyMessage = getPostEditorSafetyMessage(editor);
    if (safetyMessage) return false;

    const expectedSample = normalize(content).slice(0, 24);
    const currentText = () => normalize(editor.innerText || editor.textContent || '');

    editor.focus();
    await sleepInPage(300);
    if (document.activeElement !== editor && !editor.contains(document.activeElement)) return false;
    if (getPostEditorSafetyMessage(editor)) return false;

    // 1. Clear the editor first to avoid duplicate pasting on retries
    try {
      document.execCommand('selectAll', false);
      document.execCommand('delete', false);
    } catch {
      // ignore
    }
    if (editor.innerText || editor.textContent) {
      try {
        editor.innerHTML = '';
      } catch {
        editor.textContent = '';
      }
    }
    await sleepInPage(150);

    // 2. Primary paste using ClipboardEvent (preserves newlines in Facebook's Lexical/Draft.js)
    try {
      const clipboardData = new DataTransfer();
      clipboardData.setData('text/plain', content);
      editor.dispatchEvent(new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData,
      }));
      await sleepInPage(500);
    } catch {
      // ignore
    }

    if (expectedSample && currentText().includes(expectedSample)) return true;

    // 3. Fallback to execCommand insertText (might squish newlines, but is a fallback)
    try {
      document.execCommand('selectAll', false);
      document.execCommand('insertText', false, content);
      editor.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: content,
      }));
      await sleepInPage(500);
    } catch {
      // ignore
    }

    if (expectedSample && currentText().includes(expectedSample)) return true;

    // 4. Ultimate fallback: direct DOM injection
    if (getPostEditorSafetyMessage(editor)) return false;
    editor.textContent = content;
    editor.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data: content,
    }));
    await sleepInPage(300);
    return !expectedSample || currentText().includes(expectedSample);
  };
  const visibleText = normalize(document.body?.innerText ?? '');

  if (/\/login|checkpoint|recover|two_step/i.test(window.location.href)) {
    return {
      status: 'FAILED',
      message: 'Facebook session expired or requires checkpoint.',
    };
  }

  if (
    /content isn.?t available|this content isn.?t available|you can.?t post|not allowed to post/.test(visibleText)
    || /ban hien khong xem duoc noi dung nay|khong co quyen|khong the dang/.test(visibleText)
  ) {
    return {
      status: 'FAILED',
      message: 'Facebook account cannot access or post to this group.',
    };
  }

  window.scrollTo({ top: 0, behavior: 'auto' });
  await sleepInPage(800);

  const { surface, composerSeen } = await openPostSurface(30_000);
  if (!composerSeen) {
    return {
      status: 'FAILED',
      message: 'Could not find Facebook group post composer.',
    };
  }

  if (!surface) {
    return {
      status: 'FAILED',
      message: 'Could not open Facebook post composer dialog.',
    };
  }

  const editor = findPostEditor(surface);
  if (!editor) {
    return {
      status: 'FAILED',
      message: 'Could not find Facebook post editor.',
    };
  }

  const safetyMessage = getPostEditorSafetyMessage(editor);
  if (safetyMessage) {
    return {
      status: 'FAILED',
      message: safetyMessage,
    };
  }

  const inserted = await insertContent(editor);
  if (!inserted) {
    return {
      status: 'FAILED',
      message: 'Could not insert Facebook post content into the verified composer.',
    };
  }
  await sleepInPage(2_500 + Math.random() * 3_500);

  if (imageAttachments.length > 0) {
    const attached = await attachImagesToComposer(surface, imageAttachments);
    if (!attached.ok) {
      const fallbackSubmitButton = await waitForPostButton(surface, 3_000);
      return {
        status: 'IMAGE_ATTACH_FAILED',
        message: attached.message,
        submitButton: fallbackSubmitButton ? await buildSubmitButtonPoint(fallbackSubmitButton) : undefined,
      };
    }
    await sleepInPage(1_000);
  }

  const submitButton = await waitForPostButton(surface, imageAttachments.length > 0 ? 30_000 : 12_000);
  if (!submitButton) {
    return {
      status: 'FAILED',
      message: 'Could not find enabled Facebook Post button.',
    };
  }

  return {
    status: 'READY_TO_SUBMIT',
    message: 'Facebook post is ready to submit.',
    submitButton: await buildSubmitButtonPoint(submitButton),
  };
}

function resolveFacebookSubmitButtonPointInPage(): FacebookSubmitButtonPointProbe {
  const normalize = (value: string) => value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd')
    .replace(/\u0110/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  const POST_BUTTON_PATTERNS = [
    /^post$/,
    /^dang$/,
    /^post post$/,
    /^dang dang$/,
    /^post to group$/,
    /^dang bai$/,
    /^dang tin$/,
    /^dang len nhom$/,
    /^dang vao nhom$/,
  ];
  const COMMENT_PATTERNS = [
    /write a comment/,
    /add a comment/,
    /comment as/,
    /reply/,
    /binh luan/,
    /viet binh luan/,
    /tra loi/,
    /viet phan hoi/,
  ];
  const queryAll = (root: Document | Element, selector: string) => (
    Array.from(root.querySelectorAll(selector))
  );
  const isVisible = (element: Element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0
      && rect.height > 0
      && style.visibility !== 'hidden'
      && style.display !== 'none';
  };
  const elementLabel = (element: Element) => normalize([
    element.textContent ?? '',
    element.getAttribute('aria-label') ?? '',
    element.getAttribute('title') ?? '',
  ].join(' '));
  const matchesAny = (label: string, patterns: RegExp[]) => patterns.some((pattern) => pattern.test(label));
  const isSubmitLabel = (label: string) => matchesAny(label, POST_BUTTON_PATTERNS);
  const isCommentLabel = (label: string) => matchesAny(label, COMMENT_PATTERNS);
  const getClickableElement = (element: Element) => (
    element.closest('button, [role="button"], [tabindex], a') ?? element
  );
  const isDisabled = (element: Element) => {
    const clickable = getClickableElement(element);
    return clickable.hasAttribute('disabled')
      || clickable.getAttribute('aria-disabled') === 'true';
  };
  const resolveClickPoint = (element: Element) => {
    const clickable = getClickableElement(element);
    const rect = clickable.getBoundingClientRect();
    const candidates = [
      [0.5, 0.5],
      [0.15, 0.5],
      [0.85, 0.5],
      [0.5, 0.25],
      [0.5, 0.75],
      [0.15, 0.25],
      [0.85, 0.25],
      [0.15, 0.75],
      [0.85, 0.75],
    ];

    for (const [xRatio, yRatio] of candidates) {
      const clientX = Math.round(rect.left + rect.width * xRatio);
      const clientY = Math.round(rect.top + rect.height * yRatio);
      const hit = document.elementFromPoint(clientX, clientY);
      const hitClickable = hit?.closest?.('button, [role="button"], [tabindex], a');
      if (hit && (hit === clickable || clickable.contains(hit) || hitClickable === clickable)) {
        return { clientX, clientY };
      }
    }

    return {
      clientX: Math.round(rect.left + rect.width / 2),
      clientY: Math.round(rect.top + rect.height / 2),
    };
  };
  const isInsideCommentSurface = (element: Element) => {
    if (isCommentLabel(elementLabel(element))) return true;

    let current = element.parentElement;
    let depth = 0;
    while (current && depth < 6) {
      const label = elementLabel(current);
      if (isSubmitLabel(label)) return false;
      if (isCommentLabel(label)) return true;
      current = current.parentElement;
      depth += 1;
    }

    return false;
  };
  const isUsableClickPoint = (element: Element) => {
    const point = resolveClickPoint(element);
    const clickable = getClickableElement(element);
    const hit = document.elementFromPoint(point.clientX, point.clientY);
    const hitClickable = hit?.closest?.('button, [role="button"], [tabindex], a');
    return Boolean(hit && (hit === clickable || clickable.contains(hit) || hitClickable === clickable));
  };
  const findSubmitButton = (root: Document | Element) => {
    const uniqueClickables = new Set<Element>();

    return queryAll(root, 'button, [role="button"], [tabindex], a, span, div')
      .map((element) => ({
        source: element,
        clickable: getClickableElement(element),
      }))
      .filter(({ source, clickable }) => {
        if (uniqueClickables.has(clickable)) return false;
        uniqueClickables.add(clickable);
        if (!isVisible(clickable) || isDisabled(clickable) || isInsideCommentSurface(source)) return false;
        const labels = [elementLabel(source), elementLabel(clickable)].filter(Boolean);
        return labels.some(isSubmitLabel);
      })
      .map(({ source, clickable }) => {
        const rect = clickable.getBoundingClientRect();
        const label = elementLabel(clickable) || elementLabel(source);
        const role = clickable.getAttribute('role');
        const exactSubmitScore = /^post$|^dang$/.test(label) ? 100 : 40;
        const roleScore = clickable.tagName === 'BUTTON' || role === 'button' ? 80 : 0;
        const conciseLabelScore = label.length <= 40 ? 50 : label.length <= 80 ? 20 : -50;
        const viewportScore = rect.bottom > 0 && rect.top < window.innerHeight ? 30 : 0;
        const hitScore = isUsableClickPoint(clickable) ? 40 : -120;

        return {
          element: clickable,
          score: exactSubmitScore
            + roleScore
            + conciseLabelScore
            + viewportScore
            + hitScore
            + (clickable.closest('[role="dialog"]') ? 60 : 0)
            - Math.min(60, (rect.width * rect.height) / 1800),
        };
      })
      .sort((left, right) => right.score - left.score)[0]?.element ?? null;
  };

  const dialogs = queryAll(document, '[role="dialog"]')
    .filter((element) => isVisible(element));
  const roots = [...dialogs, document];
  for (const root of roots) {
    const button = findSubmitButton(root);

    if (button) {
      const clickPoint = resolveClickPoint(button);
      const rect = getClickableElement(button).getBoundingClientRect();
      return {
        found: true,
        submitButton: {
          clientX: clickPoint.clientX,
          clientY: clickPoint.clientY,
          label: elementLabel(button),
          rect: {
            left: Math.round(rect.left),
            top: Math.round(rect.top),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
        },
      };
    }
  }

  return { found: false };
}

function activateFacebookSubmitButtonInPage(content: string): FacebookSubmitActivationResult {
  const normalize = (value: string) => value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd')
    .replace(/\u0110/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  const POST_BUTTON_PATTERNS = [
    /^post$/,
    /^dang$/,
    /^post post$/,
    /^dang dang$/,
    /^post to group$/,
    /^dang bai$/,
    /^dang tin$/,
    /^dang len nhom$/,
    /^dang vao nhom$/,
  ];
  const COMMENT_PATTERNS = [
    /write a comment/,
    /add a comment/,
    /comment as/,
    /reply/,
    /binh luan/,
    /viet binh luan/,
    /tra loi/,
    /viet phan hoi/,
  ];
  const POST_COMPOSER_PATTERNS = [
    /write something/,
    /create a public post/,
    /create post/,
    /start a post/,
    /what.?s on your mind/,
    /ban viet gi/,
    /viet gi/,
    /tao bai viet/,
  ];
  const queryAll = (root: Document | Element, selector: string) => (
    Array.from(root.querySelectorAll(selector))
  );
  const isVisible = (element: Element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0
      && rect.height > 0
      && style.visibility !== 'hidden'
      && style.display !== 'none';
  };
  const elementLabel = (element: Element) => normalize([
    element.textContent ?? '',
    element.getAttribute('aria-label') ?? '',
    element.getAttribute('aria-placeholder') ?? '',
    element.getAttribute('placeholder') ?? '',
    element.getAttribute('title') ?? '',
  ].join(' '));
  const matchesAny = (label: string, patterns: RegExp[]) => patterns.some((pattern) => pattern.test(label));
  const isSubmitLabel = (label: string) => matchesAny(label, POST_BUTTON_PATTERNS);
  const isCommentLabel = (label: string) => matchesAny(label, COMMENT_PATTERNS);
  const getClickableElement = (element: Element) => (
    element.closest('button, [role="button"], [tabindex], a') ?? element
  );
  const isDisabled = (element: Element) => {
    const clickable = getClickableElement(element);
    return clickable.hasAttribute('disabled')
      || clickable.getAttribute('aria-disabled') === 'true';
  };
  const isInsideCommentSurface = (element: Element) => {
    if (isCommentLabel(elementLabel(element))) return true;

    let current = element.parentElement;
    let depth = 0;
    while (current && depth < 8) {
      const label = elementLabel(current);
      if (matchesAny(label, POST_COMPOSER_PATTERNS) || isSubmitLabel(label)) return false;
      if (isCommentLabel(label)) return true;
      current = current.parentElement;
      depth += 1;
    }

    return false;
  };
  const resolveClickPoint = (element: Element) => {
    const clickable = getClickableElement(element);
    const rect = clickable.getBoundingClientRect();
    const candidates = [
      [0.5, 0.5],
      [0.15, 0.5],
      [0.85, 0.5],
      [0.5, 0.25],
      [0.5, 0.75],
    ];

    for (const [xRatio, yRatio] of candidates) {
      const clientX = Math.round(rect.left + rect.width * xRatio);
      const clientY = Math.round(rect.top + rect.height * yRatio);
      const hit = document.elementFromPoint(clientX, clientY);
      const hitClickable = hit?.closest?.('button, [role="button"], [tabindex], a');
      if (hit && (hit === clickable || clickable.contains(hit) || hitClickable === clickable)) {
        return { clientX, clientY };
      }
    }

    return {
      clientX: Math.round(rect.left + rect.width / 2),
      clientY: Math.round(rect.top + rect.height / 2),
    };
  };
  const findSubmitButton = () => {
    const roots = [
      ...queryAll(document, '[role="dialog"]').filter(isVisible),
      document,
    ];
    for (const root of roots) {
      const uniqueClickables = new Set<Element>();
      const button = queryAll(root, 'button, [role="button"], [tabindex], a, span, div')
        .map((element) => ({
          source: element,
          clickable: getClickableElement(element),
        }))
        .filter(({ source, clickable }) => {
          if (uniqueClickables.has(clickable)) return false;
          uniqueClickables.add(clickable);
          if (!isVisible(clickable) || isDisabled(clickable) || isInsideCommentSurface(source)) return false;
          const labels = [elementLabel(source), elementLabel(clickable)].filter(Boolean);
          return labels.some(isSubmitLabel);
        })
        .map(({ source, clickable }) => {
          const rect = clickable.getBoundingClientRect();
          const label = elementLabel(clickable) || elementLabel(source);
          return {
            element: clickable,
            score: (/^post$|^dang$/.test(label) ? 120 : 40)
              + (clickable.closest('[role="dialog"]') ? 70 : 0)
              + (clickable.tagName === 'BUTTON' || clickable.getAttribute('role') === 'button' ? 60 : 0)
              + (label.length <= 40 ? 30 : 0)
              - Math.min(60, (rect.width * rect.height) / 1800),
          };
        })
        .sort((left, right) => right.score - left.score)[0]?.element ?? null;
      if (button) return button;
    }

    return null;
  };
  const hasSubmittedContentInEditor = () => {
    const contentSample = normalize(content).slice(0, 24);
    if (!contentSample) return true;

    return queryAll(document, '[contenteditable="true"][role="textbox"], [contenteditable="true"]')
      .filter((element): element is HTMLElement => element instanceof HTMLElement)
      .filter(isVisible)
      .some((editor) => normalize(editor.innerText || editor.textContent || '').includes(contentSample));
  };
  const dispatchMouse = (element: Element, type: string, point: { clientX: number; clientY: number }) => {
    element.dispatchEvent(new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: point.clientX,
      clientY: point.clientY,
      button: 0,
      buttons: type === 'mouseup' || type === 'click' ? 0 : 1,
    }));
  };

  if (!hasSubmittedContentInEditor()) {
    return {
      activated: false,
      message: 'DOM fallback skipped because submitted content is not present in the composer editor.',
      submitButton: null,
    };
  }

  const submitButton = findSubmitButton();
  if (!submitButton) {
    return {
      activated: false,
      message: 'DOM fallback could not find an enabled Facebook submit button.',
      submitButton: null,
    };
  }

  const clickable = getClickableElement(submitButton);
  clickable.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
  const point = resolveClickPoint(clickable);
  const rect = clickable.getBoundingClientRect();
  if (clickable instanceof HTMLElement) {
    clickable.focus({ preventScroll: true });
  }

  dispatchMouse(clickable, 'mouseover', point);
  dispatchMouse(clickable, 'mousemove', point);
  dispatchMouse(clickable, 'mousedown', point);
  dispatchMouse(clickable, 'mouseup', point);
  dispatchMouse(clickable, 'click', point);

  return {
    activated: true,
    message: 'DOM fallback dispatched mouse events to the enabled Facebook submit button.',
    submitButton: {
      clientX: point.clientX,
      clientY: point.clientY,
      label: elementLabel(clickable) || elementLabel(submitButton),
      rect: {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
    },
  };
}

function verifyFacebookPostReadyToSubmitInPage(content: string): FacebookSubmitPreflightResult {
  const normalize = (value: string) => value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd')
    .replace(/\u0110/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  const POST_BUTTON_PATTERNS = [
    /^post$/,
    /^dang$/,
    /^post post$/,
    /^dang dang$/,
    /^post to group$/,
    /^dang bai$/,
    /^dang tin$/,
    /^dang len nhom$/,
    /^dang vao nhom$/,
  ];
  const COMMENT_PATTERNS = [
    /write a comment/,
    /add a comment/,
    /comment as/,
    /reply/,
    /binh luan/,
    /viet binh luan/,
    /tra loi/,
    /viet phan hoi/,
  ];
  const CHAT_SURFACE_PATTERNS = [
    /messenger/,
    /^chats?$/,
    /chat/,
    /message/,
    /write a message/,
    /nhap tin nhan/,
    /tin nhan/,
    /doan chat/,
    /cuoc tro chuyen/,
    /goi thoai/,
    /goi video/,
    /voice call/,
    /video call/,
    /minimize chat/,
    /close chat/,
    /dong doan chat/,
    /thu nho/,
    /dang hoat dong/,
    /active now/,
  ];
  const CHAT_EDITOR_PATTERNS = [
    /^aa$/,
    /write a message/,
    /nhap tin nhan/,
    /message/,
    /tin nhan/,
  ];
  const POST_COMPOSER_PATTERNS = [
    /write something/,
    /create a public post/,
    /create post/,
    /start a post/,
    /what.?s on your mind/,
    /ban viet gi/,
    /viet gi/,
    /tao bai viet/,
  ];
  const queryAll = (root: Document | Element, selector: string) => (
    Array.from(root.querySelectorAll(selector))
  );
  const isVisible = (element: Element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0
      && rect.height > 0
      && style.visibility !== 'hidden'
      && style.display !== 'none';
  };
  const elementLabel = (element: Element) => normalize([
    element.textContent ?? '',
    element.getAttribute('aria-label') ?? '',
    element.getAttribute('aria-placeholder') ?? '',
    element.getAttribute('placeholder') ?? '',
    element.getAttribute('title') ?? '',
  ].join(' '));
  const elementAttributeLabel = (element: Element) => normalize([
    element.getAttribute('aria-label') ?? '',
    element.getAttribute('aria-placeholder') ?? '',
    element.getAttribute('placeholder') ?? '',
    element.getAttribute('title') ?? '',
  ].join(' '));
  const matchesAny = (label: string, patterns: RegExp[]) => patterns.some((pattern) => pattern.test(label));
  const isSubmitLabel = (label: string) => matchesAny(label, POST_BUTTON_PATTERNS);
  const isCommentLabel = (label: string) => matchesAny(label, COMMENT_PATTERNS);
  const isChatEditor = (element: Element) => {
    const attributeLabel = elementAttributeLabel(element);
    const shortText = normalize((element.textContent ?? '').trim());
    return matchesAny(attributeLabel, CHAT_EDITOR_PATTERNS)
      || shortText === 'aa';
  };
  const hasChatControls = (root: Document | Element) => queryAll(
    root,
    '[aria-label], [title], button, [role="button"]',
  )
    .some((element) => matchesAny(elementAttributeLabel(element), CHAT_SURFACE_PATTERNS));
  const isDockedChatLikeSurface = (element: Element) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 180
      && rect.width <= 560
      && rect.height > 80
      && rect.height <= Math.max(640, window.innerHeight * 0.9)
      && rect.bottom >= window.innerHeight - 12
      && rect.right >= window.innerWidth * 0.45
      && hasChatControls(element);
  };
  const isChatSurface = (element: Element) => {
    const attributeLabel = elementAttributeLabel(element);
    const text = normalize((element.textContent ?? '').trim());
    const compactText = text.length <= 80 ? text : '';
    return isChatEditor(element)
      || matchesAny(attributeLabel, CHAT_SURFACE_PATTERNS)
      || /^aa$|dang hoat dong|active now|doan chat|cuoc tro chuyen/.test(compactText)
      || isDockedChatLikeSurface(element);
  };
  const getClickableElement = (element: Element) => (
    element.closest('button, [role="button"], [tabindex], a') ?? element
  );
  const isDisabled = (element: Element) => {
    const clickable = getClickableElement(element);
    return clickable.hasAttribute('disabled')
      || clickable.getAttribute('aria-disabled') === 'true';
  };
  const isInsideCommentSurface = (element: Element) => {
    if (isCommentLabel(elementLabel(element)) || isChatSurface(element)) return true;

    let current = element.parentElement;
    let depth = 0;
    while (current && depth < 9) {
      const label = elementLabel(current);
      if (matchesAny(label, POST_COMPOSER_PATTERNS) || isSubmitLabel(label)) return false;
      if (isCommentLabel(label) || isChatSurface(current)) return true;
      current = current.parentElement;
      depth += 1;
    }

    return false;
  };
  const findSubmitButton = (root: Document | Element) => {
    const uniqueClickables = new Set<Element>();

    return queryAll(root, 'button, [role="button"], [tabindex], a, span, div')
      .map((element) => ({
        source: element,
        clickable: getClickableElement(element),
      }))
      .filter(({ source, clickable }) => {
        if (uniqueClickables.has(clickable)) return false;
        uniqueClickables.add(clickable);
        if (!isVisible(clickable) || isDisabled(clickable) || isInsideCommentSurface(source)) return false;
        const labels = [elementLabel(source), elementLabel(clickable)].filter(Boolean);
        return labels.some(isSubmitLabel);
      })[0]?.clickable ?? null;
  };
  const hasPostSubmitControl = (root: Document | Element) => {
    const uniqueClickables = new Set<Element>();

    return queryAll(root, 'button, [role="button"], [tabindex], a, span, div')
      .map((element) => ({
        source: element,
        clickable: getClickableElement(element),
      }))
      .some(({ source, clickable }) => {
        if (uniqueClickables.has(clickable)) return false;
        uniqueClickables.add(clickable);
        if (!isVisible(clickable) || isInsideCommentSurface(source)) return false;
        const labels = [elementLabel(source), elementLabel(clickable)].filter(Boolean);
        return labels.some(isSubmitLabel);
      });
  };
  const hasPostComposerCue = (root: Document | Element) => {
    const rootElement = root instanceof Document ? root.body : root;
    if (rootElement && matchesAny(elementLabel(rootElement), POST_COMPOSER_PATTERNS)) return true;

    return queryAll(root, '[aria-label], [aria-placeholder], [placeholder], [title]')
      .some((element) => matchesAny(elementAttributeLabel(element), POST_COMPOSER_PATTERNS));
  };
  const findPostSurfaceForEditor = (editor: HTMLElement): Element | null => {
    if (isInsideCommentSurface(editor)) return null;

    let current = editor.parentElement;
    let depth = 0;
    while (current && current !== document.body && depth < 10) {
      if (isInsideCommentSurface(current)) return null;

      const hasComposerCue = hasPostComposerCue(current);
      const hasSubmitControl = hasPostSubmitControl(current);
      const isDialog = current.getAttribute('role') === 'dialog';
      if (
        (hasComposerCue && (hasSubmitControl || isDialog))
        || (isDialog && hasSubmitControl)
      ) {
        return current;
      }

      current = current.parentElement;
      depth += 1;
    }

    return null;
  };
  const findPostEditor = (root: Document | Element) => queryAll(
    root,
    '[contenteditable="true"][role="textbox"], [contenteditable="true"]',
  )
    .filter((element): element is HTMLElement => element instanceof HTMLElement)
    .filter((element) => isVisible(element))
    .find((element) => Boolean(findPostSurfaceForEditor(element))) ?? null;
  const dialogs = queryAll(document, '[role="dialog"]')
    .filter((element) => isVisible(element))
    .filter((element) => !isInsideCommentSurface(element));
  const roots = [...dialogs, document];
  const editor = roots
    .map((root) => findPostEditor(root))
    .find((element): element is HTMLElement => Boolean(element)) ?? null;
  const submitButton = roots
    .map((root) => findSubmitButton(root))
    .find((element): element is Element => Boolean(element)) ?? null;
  const contentSample = normalize(content).slice(0, 24);
  const editorText = normalize(editor?.innerText || editor?.textContent || '');

  if (!editor) {
    return {
      ready: false,
      message: 'Facebook post editor is not open before submit.',
    };
  }

  if (contentSample && !editorText.includes(contentSample)) {
    return {
      ready: false,
      message: 'Facebook post content is not present before submit.',
    };
  }

  if (!submitButton) {
    return {
      ready: false,
      message: 'Facebook Post button is not ready before submit.',
    };
  }

  return {
    ready: true,
    message: 'Facebook post is ready before submit.',
  };
}

async function recoverFacebookPendingPostUrlInPage(
  input: FacebookPendingPostUrlRecoveryInput,
): Promise<FacebookPostReviewStatusProbeResult> {
  const sleepInPage = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const normalize = (value: string) => value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd')
    .replace(/\u0110/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  const parsePostUrl = (value: string | null | undefined) => {
    if (!value) return null;
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(value, window.location.href);
    } catch {
      return null;
    }

    const hostname = parsedUrl.hostname.toLowerCase();
    if (hostname !== 'facebook.com' && !hostname.endsWith('.facebook.com')) return null;

    const directMatch = parsedUrl.pathname.match(/^\/groups\/([^/]+)\/(posts|pending_posts|permalink)\/([^/?#]+)\/?$/i);
    if (directMatch) {
      const groupId = decodeURIComponent(directMatch[1]).trim();
      const pathType = directMatch[2].toLowerCase() === 'pending_posts' ? 'pending_posts' : 'posts';
      const postId = directMatch[3];
      const suffix = pathType === 'posts' ? '/' : '';
      return {
        groupId,
        pathType: pathType as FacebookGroupPostPathType,
        postId,
        url: `https://www.facebook.com/groups/${encodeURIComponent(groupId)}/${pathType}/${postId}${suffix}`,
      };
    }

    const groupId = getGroupIdFromUrl(parsedUrl.href)
      ?? readNumericSearchParam(parsedUrl, ['id', 'group_id', 'groupid']);
    const postId = readPostIdSearchParam(parsedUrl, [
      'story_fbid',
      'fbid',
      'multi_permalinks',
      'post_id',
      'postid',
    ]);
    if (!groupId || !postId) return null;

    return {
      groupId,
      pathType: 'pending_posts' as FacebookGroupPostPathType,
      postId,
      url: `https://www.facebook.com/groups/${encodeURIComponent(groupId)}/pending_posts/${postId}`,
    };
  };
  const readNumericSearchParam = (parsedUrl: URL, names: string[]) => {
    for (const name of names) {
      const value = parsedUrl.searchParams.get(name);
      const match = value?.match(/\d{5,}/);
      if (match?.[0]) return match[0];
    }

    return null;
  };
  const readPostIdSearchParam = (parsedUrl: URL, names: string[]) => {
    for (const name of names) {
      const value = parsedUrl.searchParams.get(name);
      const match = value?.match(/(?:\d{5,}|pfbid[a-z0-9]+)/i);
      if (match?.[0]) return match[0];
    }

    return null;
  };
  const getGroupIdFromUrl = (value: string | null | undefined) => {
    if (!value) return null;
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(value, window.location.href);
    } catch {
      return null;
    }

    const match = parsedUrl.pathname.match(/^\/groups\/([^/]+)/i);
    return match?.[1] ? decodeURIComponent(match[1]).trim() : null;
  };
  const expectedGroupIds = [
    getGroupIdFromUrl(input.targetUrl),
    input.targetExternalId?.trim() ?? null,
  ].filter((value): value is string => Boolean(value));
  const isExpectedPostUrl = (value: ReturnType<typeof parsePostUrl>) => (
    Boolean(value) && (expectedGroupIds.length === 0 || expectedGroupIds.includes(value?.groupId ?? ''))
  );
  const isVisible = (element: Element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0
      && rect.height > 0
      && style.visibility !== 'hidden'
      && style.display !== 'none'
      && rect.bottom >= 0
      && rect.top <= window.innerHeight + 80;
  };
  const textOf = (element: Element) => normalize([
    element.textContent ?? '',
    element.getAttribute('aria-label') ?? '',
    element.getAttribute('title') ?? '',
  ].join(' '));
  const hasNoPendingReviewCue = (text: string) => (
    /chua co bai viet nao de xem xet|khong co bai viet nao dang cho xem xet|no posts to review|no pending posts|no posts pending review/.test(text)
  );
  const hasPendingCue = (text: string) => (
    /pending|waiting for approval|awaiting approval|reviewing|under review|cho duyet|cho phe duyet|cho xet duyet|dang cho|dang cho xet duyet|quan tri vien phe duyet|admin approval/.test(text)
  );
  const hasPostOpenActionText = (text: string) => (
    /(^|\s)(quan ly bai viet|manage (?:your )?posts?|xem bai viet|view post|open post|go to post|see post|review post|xem chi tiet|chi tiet bai viet|xem bai dang|mo bai viet)(?=\s|$|[.,;:!?])/.test(text)
  );
  const makeSearchSamples = () => {
    const values = [input.title, input.contentPreview]
      .filter((value): value is string => Boolean(value?.trim()));

    return [...new Set(values.flatMap((value) => {
      const normalizedValue = normalize(value);
      const lines = value
        .split(/\r?\n+/)
        .map((line) => normalize(line))
        .filter((line) => line.length >= 8);
      const firstLine = lines[0] ?? '';
      const words = normalizedValue.split(' ').filter((word) => word.length > 2);
      return [
        firstLine.slice(0, 140),
        normalizedValue.slice(0, 180),
        words.slice(0, 16).join(' '),
        ...lines.slice(1, 4).map((line) => line.slice(0, 120)),
      ].filter((sample) => sample.length >= 8);
    }))];
  };
  const samples = makeSearchSamples();
  const titleSamples = [...new Set([
    normalize(input.title ?? ''),
    ...normalize(input.title ?? '').split(/\s*[-:|]\s*/).map((part) => part.trim()),
  ].filter((sample) => sample.length >= 8))];
  const contentPreviewSamples = [...new Set(
    normalize(input.contentPreview ?? '')
      .split(/\r?\n+/)
      .flatMap((line) => [line.trim(), line.trim().slice(0, 140)])
      .filter((sample) => sample.length >= 24),
  )];
  const isBoundaryCharacter = (value: string | undefined) => !value || !/[a-z0-9]/i.test(value);
  const containsPhrase = (text: string, sample: string) => {
    let index = text.indexOf(sample);
    while (index >= 0) {
      const before = text[index - 1];
      const after = text[index + sample.length];
      if (isBoundaryCharacter(before) && isBoundaryCharacter(after)) return true;
      index = text.indexOf(sample, index + 1);
    }

    return false;
  };
  const containsTitlePhrase = (text: string, sample: string) => {
    let index = text.indexOf(sample);
    while (index >= 0) {
      const before = text[index - 1];
      const after = text[index + sample.length];
      const facebookJoinedNextWord = /\d$/.test(sample) && Boolean(after) && /[a-z]/i.test(after);
      if (isBoundaryCharacter(before) && (isBoundaryCharacter(after) || facebookJoinedNextWord)) return true;
      index = text.indexOf(sample, index + 1);
    }

    return false;
  };
  const scoreSamplesInText = (text: string, sampleValues: string[], exactMultiplier: number) => (
    sampleValues.reduce((score, sample) => {
      if (containsPhrase(text, sample)) return score + Math.min(360, sample.length * exactMultiplier);
      if (text.includes(sample)) return score + Math.min(240, sample.length * 3);
      if (sample.length >= 40 && text.includes(sample.slice(0, 40))) return score + 80;
      if (sample.length >= 24 && text.includes(sample.slice(0, 24))) return score + 40;
      return score;
    }, 0)
  );
  const scoreTitleSamplesInText = (text: string) => (
    titleSamples.reduce((score, sample) => (
      containsTitlePhrase(text, sample) ? score + Math.min(360, sample.length * 6) : score
    ), 0)
  );
  const titleTokens = normalize(input.title ?? '')
    .split(/[^a-z0-9]+/i)
    .filter((word) => word.length >= 3);
  const hasDistinctiveTitleToken = titleTokens.some((word) => /\d/.test(word) || word.length >= 5);
  const getTitleTokenScore = (text: string) => {
    if (titleTokens.length < 3 || !hasDistinctiveTitleToken) return 0;
    return titleTokens.every((word) => containsPhrase(text, word)) ? 90 : 0;
  };
  const getSubmittedContentMatchForText = (value: string) => {
    const text = normalize(value);
    if (text.length < 8) {
      return {
        matched: samples.length === 0,
        score: 0,
      };
    }

    const titleScore = scoreTitleSamplesInText(text) + getTitleTokenScore(text);
    const previewScore = scoreSamplesInText(text, contentPreviewSamples, 4);
    const sampleScore = scoreSamplesInText(text, samples, 3);
    const hasTitleRequirement = titleSamples.length > 0;
    return {
      matched: samples.length === 0
        || titleScore > 0
        || (!hasTitleRequirement && (previewScore > 0 || sampleScore >= 80)),
      score: titleScore + previewScore + sampleScore,
    };
  };
  const getContentMatch = (element: Element) => getSubmittedContentMatchForText(textOf(element));
  const hasSubmittedContentMatch = (element: Element) => getContentMatch(element).matched;
  const pageHasSubmittedContentMatch = () => {
    if (samples.length === 0) return true;

    const articleCandidates = Array.from(
      document.querySelectorAll('[role="article"], article, [data-pagelet*="FeedUnit"], div[aria-posinset]'),
    ).filter(isVisible);
    if (articleCandidates.some(hasSubmittedContentMatch)) return true;

    return getSubmittedContentMatchForText(document.body?.innerText ?? '').matched;
  };
  const getClickableElement = (element: Element) => (
    element.closest('a[href], [role="link"], [role="button"], button, [tabindex]') ?? element
  );
  const getCardRoot = (element: Element) => {
    let current: Element | null = element;
    let best: Element = element;
    let depth = 0;

    while (current && current !== document.body && depth < 16) {
      const rect = current.getBoundingClientRect();
      const text = normalize(current.textContent ?? '');
      const looksLikeCard = rect.width >= 260
        && rect.height >= 70
        && text.length >= 40
        && text.length <= 10_000;
      if (looksLikeCard) best = current;
      if (current.matches('[role="article"], article, [data-pagelet*="FeedUnit"], div[aria-posinset]')) {
        return current;
      }

      current = current.parentElement;
      depth += 1;
    }

    return best;
  };
  const collectCardCandidates = () => {
    const cards = new Set<Element>();
    const explicitCards = Array.from(
      document.querySelectorAll('[role="article"], article, [data-pagelet*="FeedUnit"], div[aria-posinset]'),
    );
    explicitCards.filter(isVisible).forEach((element) => cards.add(element));

    const textElements = Array.from(document.querySelectorAll('div, span, p'))
      .filter((element) => isVisible(element))
      .filter((element) => samples.length > 0 && hasSubmittedContentMatch(element));
    textElements.forEach((element) => cards.add(getCardRoot(element)));

    const actionElements = Array.from(document.querySelectorAll('button, [role="button"], a, span, div'))
      .filter((element) => isVisible(element))
      .filter((element) => /^(chinh sua|edit|xoa|delete)$/.test(textOf(element)) || hasPostOpenActionText(textOf(element)));
    actionElements.forEach((element) => cards.add(getCardRoot(element)));

    return Array.from(cards).filter(isVisible);
  };
  const findBestCards = () => {
    const scored = collectCardCandidates()
      .map((card) => {
        const text = textOf(card);
        const rect = card.getBoundingClientRect();
        const contentMatch = getContentMatch(card);
        if (samples.length > 0 && !contentMatch.matched) return null;
        const pendingScore = hasPendingCue(text) ? 100 : 0;
        const actionScore = /chinh sua|edit|xoa|delete/.test(text) || hasPostOpenActionText(text) ? 25 : 0;
        const viewportScore = rect.top >= -80 && rect.top <= window.innerHeight ? 30 : 0;
        const sizePenalty = Math.max(0, (text.length - 2_400) / 120);
        return {
          card,
          score: contentMatch.score + pendingScore + actionScore + viewportScore - sizePenalty,
        };
      })
      .filter((item): item is { card: Element; score: number } => Boolean(item))
      .filter((item) => item.score >= 45)
      .sort((left, right) => right.score - left.score);

    const recentScored = input.requireRecent
      ? scored.filter((item) => hasRecentTimestampCue(item.card))
      : scored;
    const anyTimestampScored = input.requireRecent
      ? scored.filter((item) => hasAnyTimestampCue(item.card))
      : [];
    const candidateList = recentScored.length > 0
      ? recentScored
      : anyTimestampScored.length > 0
        ? anyTimestampScored
        : scored;

    return {
      cards: [...new Set(candidateList.map((item) => item.card))].slice(0, 8),
      sawSimilarButNotRecent: Boolean(input.requireRecent && scored.length > 0 && recentScored.length === 0),
    };
  };
  const findPostUrlInCard = (card: Element) => {
    if (samples.length > 0 && !hasSubmittedContentMatch(card)) return null;

    const links = Array.from(card.querySelectorAll('a[href]'));
    for (const link of links) {
      const postUrl = parsePostUrl(link.getAttribute('href'));
      if (isExpectedPostUrl(postUrl)) return postUrl;
    }

    return findPostUrlInSerializedCard(card) ?? findPostUrlInPageScriptsForMatchedCard(card);
  };
  const decodeSerializedFacebookHtml = (value: string) => {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = value;
    return textarea.value
      .replace(/\\\//g, '/')
      .replace(/\\"/g, '"')
      .replace(/\\u0025/g, '%')
      .replace(/\\u002F/gi, '/')
      .replace(/\\u0026/g, '&');
  };
  const buildSerializedPostUrl = (groupId: string, postId: string, pathType: FacebookGroupPostPathType) => {
    const normalizedGroupId = decodeURIComponent(groupId).trim();
    const normalizedPostId = postId.trim();
    if (!normalizedGroupId || !normalizedPostId) return null;
    const suffix = pathType === 'posts' ? '/' : '';
    return {
      groupId: normalizedGroupId,
      pathType,
      postId: normalizedPostId,
      url: `https://www.facebook.com/groups/${encodeURIComponent(normalizedGroupId)}/${pathType}/${normalizedPostId}${suffix}`,
    };
  };
  const findPostUrlInSerializedCard = (card: Element) => {
    const serialized = decodeSerializedFacebookHtml([
      card.outerHTML,
      card.textContent ?? '',
    ].join(' '));
    const directUrlMatches = [
      ...serialized.matchAll(/https?:\/\/(?:www\.)?facebook\.com\/groups\/[^"'<>\\\s]+\/(?:posts|pending_posts|permalink)\/[^"'<>\\\s]+/gi),
      ...serialized.matchAll(/\/groups\/[^"'<>\\\s]+\/(?:posts|pending_posts|permalink)\/[^"'<>\\\s]+/gi),
    ];
    for (const match of directUrlMatches) {
      const postUrl = parsePostUrl(match[0]);
      if (isExpectedPostUrl(postUrl)) return postUrl;
    }

    const expectedGroupId = expectedGroupIds[0] ?? getGroupIdFromUrl(window.location.href);
    if (!expectedGroupId) return null;

    const fieldMatches = [
      ...serialized.matchAll(/["'](?:post_id|top_level_post_id|story_fbid|share_fbid|legacy_fbid)["']\s*:\s*["']((?:pfbid[a-z0-9]+)|\d{5,})["']/gi),
      ...serialized.matchAll(/(?:post_id|top_level_post_id|story_fbid|share_fbid|legacy_fbid)\\?["']?\s*[:=]\s*\\?["']?((?:pfbid[a-z0-9]+)|\d{5,})/gi),
    ];
    for (const match of fieldMatches) {
      const postId = match[1]?.trim();
      if (!postId || expectedGroupIds.includes(postId)) continue;
      const pendingPostUrl = buildSerializedPostUrl(expectedGroupId, postId, 'pending_posts');
      if (isExpectedPostUrl(pendingPostUrl)) return pendingPostUrl;
    }

    return null;
  };
  const decodeFacebookScriptText = (value: string) => decodeSerializedFacebookHtml(value)
    .replace(/\\u([0-9a-fA-F]{4})/g, (_match, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\n|\\r|\\t/g, ' ')
    .replace(/\\\\/g, '\\');
  const getScriptChunkContentScore = (value: string) => {
    if (samples.length === 0) return 0;
    const contentMatch = getSubmittedContentMatchForText(value);
    return contentMatch.matched ? contentMatch.score : 0;
  };
  const findPostUrlInPageScriptsForMatchedCard = (card: Element) => {
    const expectedGroupId = expectedGroupIds[0] ?? getGroupIdFromUrl(window.location.href);
    if (!expectedGroupId) return null;

    if (samples.length > 0 && !hasSubmittedContentMatch(card)) return null;

    const scripts = Array.from(document.querySelectorAll('script[type="application/json"]'))
      .map((script) => script.textContent ?? '')
      .filter((text) => text.length > 1_000);
    const candidates: Array<{ postUrl: ReturnType<typeof parsePostUrl>; score: number }> = [];
    for (const scriptText of scripts) {
      const postIdMatches = [
        ...scriptText.matchAll(/(?:post_id|top_level_post_id|story_fbid|share_fbid|legacy_fbid)\\*["']?\s*[:=]\s*\\*["']?((?:pfbid[a-z0-9]+)|\d{5,})/gi),
        ...scriptText.matchAll(/["'](?:post_id|top_level_post_id|story_fbid|share_fbid|legacy_fbid)["']\s*:\s*["']((?:pfbid[a-z0-9]+)|\d{5,})["']/gi),
      ];

      for (const match of postIdMatches) {
        const postId = match[1]?.trim();
        if (!postId || expectedGroupIds.includes(postId)) continue;

        const matchIndex = match.index ?? 0;
        const chunk = decodeFacebookScriptText(scriptText.slice(
          Math.max(0, matchIndex - 7_000),
          Math.min(scriptText.length, matchIndex + 14_000),
        ));
        const contentScore = getScriptChunkContentScore(chunk);
        if (contentScore <= 0) continue;

        const groupScore = expectedGroupIds.some((groupId) => chunk.includes(groupId)) ? 220 : 0;
        const pendingScore = /my_pending_content|pending_content|pending|cho duyet|dang cho/.test(normalize(chunk)) ? 80 : 0;
        const storyScore = /"__typename":"story"|feedunit|cometfeedstory|feedback/.test(chunk.toLowerCase()) ? 60 : 0;
        const postUrl = buildSerializedPostUrl(expectedGroupId, postId, 'pending_posts');
        if (!isExpectedPostUrl(postUrl)) continue;
        candidates.push({
          postUrl,
          score: contentScore + groupScore + pendingScore + storyScore,
        });
      }
    }

    return candidates.sort((left, right) => right.score - left.score)[0]?.postUrl ?? null;
  };
  const findContentElement = (card: Element) => {
    const candidates = Array.from(card.querySelectorAll('div, span, p'))
      .filter(isVisible)
      .map((element) => {
        const contentMatch = getContentMatch(element);
        return {
          element,
          matched: contentMatch.matched,
          score: contentMatch.score,
          textLength: textOf(element).length,
        };
      })
      .filter((item) => item.matched && item.textLength <= 2_500)
      .sort((left, right) => right.score - left.score || left.textLength - right.textLength);

    return candidates[0]?.element ?? null;
  };
  const elementAttributeText = (element: Element) => normalize([
    element.getAttribute('aria-label') ?? '',
    element.getAttribute('title') ?? '',
    element.getAttribute('aria-haspopup') ?? '',
  ].join(' '));
  const directTextOf = (element: Element) => normalize([
    Array.from(element.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent ?? '')
      .join(' '),
    elementAttributeText(element),
  ].join(' '));
  const getTimestampTextSamples = (element: Element) => {
    const clickable = getClickableElement(element);
    const rawSamples = [
      textOf(element),
      directTextOf(element),
      elementAttributeText(element),
      clickable !== element ? textOf(clickable) : null,
      clickable !== element ? directTextOf(clickable) : null,
      clickable !== element ? elementAttributeText(clickable) : null,
    ]
      .filter((value): value is string => Boolean(value?.trim()));

    return [...new Set(rawSamples)];
  };
  const hasTimestampText = (value: string, recentOnly: boolean) => {
    const boundary = '(?=\\s|$|[.,;:!?\\)]|\\u2022)';
    const relativeWords = recentOnly
      ? 'vua xong|just now|now|moments ago|a few seconds ago|few seconds ago|seconds ago|mot chut truoc|hom qua|yesterday|hom nay|today'
      : 'vua xong|just now|now|moments ago|a few seconds ago|few seconds ago|seconds ago|mot chut truoc|hom qua|yesterday|hom nay|today';
    const relativeUnits = recentOnly
      ? 's|sec|secs|second|seconds|giay|m|min|mins|minute|minutes|phut|h|hr|hrs|hour|hours|gio|d|day|days|w|week|weeks|tuan|mo|month|months|thang|y|yr|year|years|nam'
      : 's|sec|secs|second|seconds|giay|m|min|mins|minute|minutes|phut|h|hr|hrs|hour|hours|gio|d|day|days|ngay|w|week|weeks|tuan|mo|month|months|thang|y|yr|year|years|nam';

    return new RegExp(`(^|\\s)(${relativeWords})${boundary}`).test(value)
      || new RegExp(`(^|\\s)\\d{1,3}\\s*(${relativeUnits})(\\s*(ago|truoc))?${boundary}`).test(value)
      || new RegExp(`(^|\\s)(one|mot)\\s*(m|min|mins|minute|minutes|phut)(\\s*(ago|truoc))?${boundary}`).test(value)
      || new RegExp(`(^|\\s)(a few|few|vai)\\s*(m|min|mins|minute|minutes|phut)\\s*(ago|truoc)?${boundary}`).test(value)
      || new RegExp(`(^|\\s)\\d{1,2}\\s*thang\\s*\\d{1,2}(\\s*,?\\s*\\d{4})?${boundary}`).test(value)
      || new RegExp(`(^|\\s)\\d{1,2}\\/\\d{1,2}(\\/\\d{2,4})?${boundary}`).test(value);
  };
  const isTimestampLike = (element: Element) => (
    getTimestampTextSamples(element)
      .some((value) => (
        (value.length <= 220 && hasTimestampText(value, false))
        || hasTimestampText(value.slice(0, 320), false)
      ))
    );
  const isRecentTimestampLike = (element: Element) => (
    getTimestampTextSamples(element)
      .some((value) => (
        (value.length <= 220 && hasTimestampText(value, true))
        || hasTimestampText(value.slice(0, 320), true)
      ))
  );
  const hasActionMenuText = (value: string) => (
    value.includes('...')
      || /(^|\s)(more|more options|actions?|options?|menu|see more|xem them|khac|tuy chon|chinh sua|edit|xoa|delete|moi nhat truoc|newest|tim hieu them|learn more|quan ly bai viet|manage posts|binh luan|comment|thich|like|gui|send)(\s|$)/.test(value)
  );
  const isBadTimestampCandidate = (element: Element, card: Element) => {
    const value = textOf(element);
    const directValue = directTextOf(element);
    if (hasActionMenuText(directValue) || (value.length <= 140 && hasActionMenuText(value))) return true;

    let current: Element | null = element;
    let depth = 0;
    while (current && current !== card && depth < 5) {
      const role = current.getAttribute('role');
      if (role === 'menu' || role === 'menuitem') return true;
      if (current.hasAttribute('aria-haspopup')) return true;
      if (hasActionMenuText(elementAttributeText(current)) || hasActionMenuText(directTextOf(current))) {
        return true;
      }
      current = current.parentElement;
      depth += 1;
    }

    return false;
  };
  const isTopRightActionZone = (rect: DOMRect, cardRect: DOMRect) => (
    rect.top <= cardRect.top + 150
      && (
        rect.left > cardRect.left + cardRect.width * 0.72
          || rect.right > cardRect.right - 80
      )
  );
  const getSemanticHref = (element: Element) => {
    const clickable = getClickableElement(element);
    if (clickable instanceof HTMLAnchorElement) return clickable.href;
    if (element instanceof HTMLAnchorElement) return element.href;
    return clickable.getAttribute('href') ?? element.getAttribute('href');
  };
  const isPendingManagerInternalTimestampHref = (value: string | null | undefined) => {
    if (!value) return false;

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(value, window.location.href);
    } catch {
      return false;
    }

    const hostname = parsedUrl.hostname.toLowerCase();
    if (hostname !== 'facebook.com' && !hostname.endsWith('.facebook.com')) return false;
    if (!/\/groups\/[^/]+\/my_pending_content\/?$/i.test(parsedUrl.pathname)) return false;
    if (/\/user\/|profile\.php/i.test(value)) return false;

    return parsedUrl.searchParams.has('__cft__[0]')
      || parsedUrl.searchParams.has('__tn__')
      || /daf/i.test(parsedUrl.hash);
  };
  const isSemanticLink = (element: Element, clickable: Element) => (
    element instanceof HTMLAnchorElement
      || clickable instanceof HTMLAnchorElement
      || element.getAttribute('role') === 'link'
      || clickable.getAttribute('role') === 'link'
  );
  const getTimestampScopes = (card: Element) => {
    const scopes = new Set<Element>([card]);
    const cardRect = card.getBoundingClientRect();
    let current = card.parentElement;
    let depth = 0;

    while (current && current !== document.body && depth < 7) {
      const rect = current.getBoundingClientRect();
      const text = normalize(current.textContent ?? '');
      const reasonableAncestor = rect.width >= Math.min(240, cardRect.width * 0.75)
        && rect.width <= Math.max(window.innerWidth, cardRect.width + 260)
        && rect.height >= cardRect.height
        && rect.height <= Math.max(900, cardRect.height + 520)
        && text.length >= 20
        && text.length <= 14_000;
      if (reasonableAncestor) scopes.add(current);
      if (current.matches('[role="article"], article, [data-pagelet*="FeedUnit"], div[aria-posinset]')) {
        break;
      }

      current = current.parentElement;
      depth += 1;
    }

    return Array.from(scopes).filter(isVisible);
  };
  const isInsideAnyTimestampScope = (element: Element, scopes: Element[]) => (
    scopes.some((scope) => scope === element || scope.contains(element))
  );
  const hasRecentTimestampCue = (card: Element) => {
    const scopes = getTimestampScopes(card);
    const candidates = scopes.flatMap((scope) => (
      Array.from(scope.querySelectorAll('a[href], [role="link"], [role="button"], button, span, div'))
    )).filter(isVisible);

    return candidates.some((element) => {
      const clickable = getClickableElement(element);
      return isInsideAnyTimestampScope(clickable, scopes)
        && !isBadTimestampCandidate(element, card)
        && !isBadTimestampCandidate(clickable, card)
        && (isRecentTimestampLike(element) || isRecentTimestampLike(clickable));
    });
  };
  const hasAnyTimestampCue = (card: Element) => {
    const scopes = getTimestampScopes(card);
    const candidates = scopes.flatMap((scope) => (
      Array.from(scope.querySelectorAll('a[href], [role="link"], [role="button"], button, span, div'))
    )).filter(isVisible);

    return candidates.some((element) => {
      const clickable = getClickableElement(element);
      return isInsideAnyTimestampScope(clickable, scopes)
        && !isBadTimestampCandidate(element, card)
        && !isBadTimestampCandidate(clickable, card)
        && (isTimestampLike(element) || isTimestampLike(clickable));
    });
  };
  type TimestampProbePoint = { x: number; y: number };
  type ResolvedTimestampCandidate = {
    accepted: boolean;
    hrefPostUrl: ReturnType<typeof parsePostUrl>;
    point: FacebookSubmitButtonPoint;
    score: number;
  };
  const buildTimestampPoint = (rect: DOMRect): FacebookSubmitButtonPoint => ({
    clientX: Math.round(rect.left + rect.width / 2),
    clientY: Math.round(rect.top + rect.height / 2),
    label: 'Facebook pending post timestamp',
  });
  const buildTimestampProbePoint = (point: TimestampProbePoint): FacebookSubmitButtonPoint => ({
    clientX: Math.round(point.x),
    clientY: Math.round(point.y),
    label: 'Facebook pending post timestamp visual probe',
  });
  const buildPostOpenActionPoint = (rect: DOMRect): FacebookSubmitButtonPoint => ({
    clientX: Math.round(rect.left + rect.width / 2),
    clientY: Math.round(rect.top + rect.height / 2),
    label: 'Facebook pending post open action',
    rect: {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    },
  });
  const getPostOpenActionCandidates = (card: Element) => {
    const scopes = getTimestampScopes(card);
    const cardRect = card.getBoundingClientRect();
    const contentRect = findContentElement(card)?.getBoundingClientRect() ?? null;
    const seenTargets = new Set<Element>();
    const actionCandidates = scopes
      .flatMap((scope) => Array.from(scope.querySelectorAll('a[href], [role="link"], [role="button"], button, [tabindex], span, div')))
      .filter(isVisible)
      .map((element) => {
        const clickable = getClickableElement(element);
        const target = clickable === element ? element : clickable;
        if (seenTargets.has(target)) return null;
        seenTargets.add(target);
        if (!isInsideAnyTimestampScope(target, scopes) || !isVisible(target)) return null;

        const elementText = textOf(element);
        const clickableText = textOf(clickable);
        const actionText = normalize([
          directTextOf(element),
          elementAttributeText(element),
          elementText.length <= 180 ? elementText : '',
          clickable !== element ? directTextOf(clickable) : '',
          clickable !== element ? elementAttributeText(clickable) : '',
          clickable !== element && clickableText.length <= 180 ? clickableText : '',
        ].join(' '));
        if (!hasPostOpenActionText(actionText)) return null;

        const rect = target.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return null;

        const hrefPostUrl = parsePostUrl(getSemanticHref(element));
        const hasExpectedPostUrl = isExpectedPostUrl(hrefPostUrl);
        const semantic = isSemanticLink(element, clickable)
          || clickable.getAttribute('role') === 'button'
          || clickable instanceof HTMLButtonElement;
        const compact = rect.width <= Math.min(cardRect.width * 0.85, 380) && rect.height <= 76;
        const tooLarge = rect.width > Math.min(cardRect.width * 0.94, 620) && rect.height > 120;
        if (tooLarge && !hasExpectedPostUrl) return null;
        if (!semantic && !compact && !hasExpectedPostUrl) return null;

        const primaryTextScore = /(^|\s)(quan ly bai viet|manage (?:your )?posts?)(?=\s|$|[.,;:!?])/.test(actionText)
          ? 260
          : /(^|\s)(xem bai viet|view post|open post|go to post|see post|review post)(?=\s|$|[.,;:!?])/.test(actionText)
            ? 230
            : 160;
        const contentDistancePenalty = contentRect
          ? Math.max(0, Math.abs((rect.top + rect.bottom) / 2 - (contentRect.top + contentRect.bottom) / 2) - 320) / 10
          : 0;
        const score = (hasExpectedPostUrl ? 600 : 0)
          + primaryTextScore
          + (semantic ? 110 : 0)
          + (compact ? 80 : 0)
          - Math.max(0, rect.width - 280) / 5
          - contentDistancePenalty;

        if (score < 150) return null;

        return {
          point: buildPostOpenActionPoint(rect),
          score,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort((left, right) => right.score - left.score);

    const seenPoints = new Set<string>();
    return actionCandidates
      .map((candidate) => candidate.point)
      .filter((point) => {
        const key = `${point.clientX}:${point.clientY}`;
        if (seenPoints.has(key)) return false;
        seenPoints.add(key);
        return true;
      })
      .slice(0, 4);
  };
  const isAcceptedTimestampCandidate = (input: {
    hrefPostUrl: ReturnType<typeof parsePostUrl>;
    looksTimeLike: boolean;
    closeAboveContent: boolean;
    semanticLink: boolean;
    score: number;
  }) => (
    isExpectedPostUrl(input.hrefPostUrl)
      || (
        input.score >= 210
          && input.looksTimeLike
          && (input.semanticLink || input.closeAboveContent)
      )
  );
  const getRectScore = (rect: DOMRect, cardRect: DOMRect, contentRect: DOMRect | null) => {
    const inLeftReadingLane = rect.left < cardRect.left + Math.min(cardRect.width * 0.6, 420);
    const awayFromRightEdge = rect.right < cardRect.right - 80;
    if (!inLeftReadingLane || !awayFromRightEdge || isTopRightActionZone(rect, cardRect)) {
      return -1_000;
    }

    if (!contentRect) return 0;
    const verticalGap = contentRect.top - rect.bottom;
    if (rect.bottom > contentRect.top + 16) return -500;
    if (verticalGap < -8 || verticalGap > 95) return -250;

    return Math.max(0, 80 - Math.abs(verticalGap - 18));
  };
  const getTimestampProbePoints = (cardRect: DOMRect, contentRect: DOMRect | null) => {
    if (!contentRect) return [];

    const leftReadingX = [
      contentRect.left + 28,
      contentRect.left + 56,
      contentRect.left + Math.min(92, Math.max(36, contentRect.width * 0.16)),
      contentRect.left + Math.min(132, Math.max(56, contentRect.width * 0.22)),
      contentRect.left + Math.min(180, Math.max(76, contentRect.width * 0.28)),
      cardRect.left + 96,
      cardRect.left + 156,
    ];
    const likelyTimestampY = [
      contentRect.top - 16,
      contentRect.top - 22,
      contentRect.top - 30,
      contentRect.top - 38,
      Math.max(cardRect.top + 26, contentRect.top - 58),
      Math.max(cardRect.top + 34, contentRect.top - 46),
    ];

    const points = leftReadingX.flatMap((x) => likelyTimestampY.map((y) => ({ x, y })));
    const seen = new Set<string>();
    return points
      .filter((point) => (
        Number.isFinite(point.x)
          && Number.isFinite(point.y)
          && point.x >= 0
          && point.x <= window.innerWidth
          && point.y >= 0
          && point.y <= window.innerHeight
      ))
      .filter((point) => {
        const key = `${Math.round(point.x)}:${Math.round(point.y)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  };
  const getPointGeometryScore = (
    point: TimestampProbePoint,
    rect: DOMRect,
    cardRect: DOMRect,
    contentRect: DOMRect | null,
  ) => {
    if (!contentRect) return -1_000;

    const verticalGap = contentRect.top - point.y;
    const inLikelyTimestampBand = verticalGap >= 8 && verticalGap <= 115;
    const inLeftReadingLane = point.x < cardRect.left + Math.min(cardRect.width * 0.68, 480);
    const awayFromRightEdge = point.x < cardRect.right - 72;
    const horizontallyNearContent = point.x >= Math.min(cardRect.left, contentRect.left) - 8
      && point.x <= Math.max(cardRect.right, contentRect.right) + 8;
    if (
      !inLikelyTimestampBand
        || !inLeftReadingLane
        || !awayFromRightEdge
        || !horizontallyNearContent
        || isTopRightActionZone(rect, cardRect)
    ) {
      return -1_000;
    }

    const rectGap = contentRect.top - rect.bottom;
    const rectPenalty = rectGap < -24 || rectGap > 145 ? 70 : 0;
    return Math.max(0, 150 - Math.abs(verticalGap - 24) * 2 - rectPenalty);
  };
  const getTimestampCandidates = (card: Element) => {
    const scopes = getTimestampScopes(card);
    const contentElement = findContentElement(card);
    const contentRect = contentElement?.getBoundingClientRect() ?? null;
    const cardRect = card.getBoundingClientRect();
    const probePoints = getTimestampProbePoints(cardRect, contentRect);
    const domCandidates = scopes.flatMap((scope) => (
      Array.from(scope.querySelectorAll('a[href], [role="link"], [role="button"], button, span, div'))
    ));
    const visualProbeEntries = probePoints
      .flatMap((point) => document.elementsFromPoint(point.x, point.y)
        .flatMap((element) => {
          const clickable = getClickableElement(element);
          return (clickable === element ? [element] : [element, clickable])
            .map((candidate) => ({ element: candidate, point }));
        }));
    const visualCandidates = visualProbeEntries.map((entry) => entry.element);
    const rawCandidates = [...new Set([...domCandidates, ...visualCandidates])]
      .filter(isVisible)
      .filter((element) => isInsideAnyTimestampScope(element, scopes))
      .filter((element) => !isBadTimestampCandidate(element, card));

    const standardCandidates: ResolvedTimestampCandidate[] = rawCandidates
      .map((element) => {
        const clickable = getClickableElement(element);
        if (!isInsideAnyTimestampScope(clickable, scopes) || isBadTimestampCandidate(clickable, card)) return null;

        const rect = (clickable === element ? element : clickable).getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return null;

        const href = getSemanticHref(element);
        const hrefPostUrl = parsePostUrl(href);
        const looksTimeLike = isTimestampLike(element) || isTimestampLike(clickable);
        const hasExpectedPostUrl = isExpectedPostUrl(hrefPostUrl);
        const looksLikeTimeLike = looksTimeLike || hasExpectedPostUrl;
        const verticalGap = contentRect ? contentRect.top - rect.bottom : null;
        const horizontallyAligned = contentRect
          ? rect.left < contentRect.right && rect.right > contentRect.left
          : true;
        const closeAboveContent = verticalGap !== null
          && verticalGap >= -8
          && verticalGap <= 95
          && horizontallyAligned;
        const compact = rect.width <= 180 && rect.height <= 36;
        const semanticLink = isSemanticLink(element, clickable);
        const closeToPendingHeader = verticalGap !== null
          && verticalGap >= 24
          && verticalGap <= 155
          && horizontallyAligned;
        const inPendingCardHeader = rect.top >= cardRect.top - 8
          && rect.top <= cardRect.top + 170
          && rect.left < cardRect.left + Math.min(cardRect.width * 0.62, 440)
          && !isTopRightActionZone(rect, cardRect);
        const pendingManagerTimestampAnchor = semanticLink
          && compact
          && (closeToPendingHeader || inPendingCardHeader)
          && isPendingManagerInternalTimestampHref(href);
        const rectScore = getRectScore(rect, cardRect, contentRect);
        const usefulShape = compact || semanticLink || closeAboveContent || pendingManagerTimestampAnchor || hasExpectedPostUrl;
        if (!looksLikeTimeLike) {
          if (!pendingManagerTimestampAnchor) return null;
        }
        if (!usefulShape) {
          return null;
        }

        const score = (isExpectedPostUrl(hrefPostUrl) ? 500 : 0)
          + (pendingManagerTimestampAnchor ? 420 : 0)
          + (looksTimeLike ? 250 : 0)
          + (closeAboveContent ? 160 : 0)
          + (closeToPendingHeader || inPendingCardHeader ? 120 : 0)
          + (compact ? 80 : 0)
          + (semanticLink ? 80 : 0)
          + rectScore
          - Math.max(0, rect.width - 160) / 4;
        const accepted = isAcceptedTimestampCandidate({
          hrefPostUrl,
          looksTimeLike: looksTimeLike || pendingManagerTimestampAnchor,
          closeAboveContent: closeAboveContent || closeToPendingHeader || inPendingCardHeader,
          semanticLink,
          score,
        });

        if (rectScore < 0 && !accepted && !hasExpectedPostUrl) {
          return null;
        }

        return {
          accepted,
          hrefPostUrl,
          point: buildTimestampPoint(rect),
          score: Math.max(score, 0),
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .filter((item) => item.score >= 60);
    const visualFallbackCandidates: ResolvedTimestampCandidate[] = visualProbeEntries
      .map(({ element, point }) => {
        const clickable = getClickableElement(element);
        const target = clickable === element ? element : clickable;
        if (!isVisible(target) || isBadTimestampCandidate(element, card) || isBadTimestampCandidate(target, card)) {
          return null;
        }

        const rect = target.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return null;

        const href = getSemanticHref(element);
        const hrefPostUrl = parsePostUrl(href);
        const looksTimeLike = isTimestampLike(element) || isTimestampLike(target);
        const hasExpectedPostUrl = isExpectedPostUrl(hrefPostUrl);
        const semanticLink = isSemanticLink(element, target);
        const compact = rect.width <= 260 && rect.height <= 56;
        const targetText = textOf(target);
        const targetIsTooLarge = rect.width > Math.min(cardRect.width * 0.9, 560)
          && rect.height > 90
          && !looksTimeLike
          && !hasExpectedPostUrl;
        const geometryScore = getPointGeometryScore(point, rect, cardRect, contentRect);
        const insideKnownScope = isInsideAnyTimestampScope(element, scopes) || isInsideAnyTimestampScope(target, scopes);
        if (geometryScore < 55 && !looksTimeLike && !hasExpectedPostUrl) return null;
        if (!insideKnownScope && geometryScore < 95 && !hasExpectedPostUrl) return null;
        if (targetIsTooLarge) return null;
        if (!semanticLink && !compact && !looksTimeLike && !hasExpectedPostUrl) return null;
        if (targetText.length > 700 && !looksTimeLike && !hasExpectedPostUrl && !compact) return null;

        const score = (hasExpectedPostUrl ? 520 : 0)
          + (looksTimeLike ? 280 : 0)
          + (semanticLink ? 100 : 0)
          + (compact ? 90 : 0)
          + geometryScore
          - Math.max(0, rect.width - 220) / 5;
        const accepted = hasExpectedPostUrl
          || looksTimeLike
          || (geometryScore >= 90 && (semanticLink || compact));
        if (!accepted && !hasExpectedPostUrl) return null;

        return {
          accepted,
          hrefPostUrl,
          point: buildTimestampProbePoint(point),
          score: Math.max(score, 0),
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .filter((item) => item.score >= 60);
    const seenCandidates = new Set<string>();
    return [...standardCandidates, ...visualFallbackCandidates]
      .filter((item) => {
        const key = [
          item.hrefPostUrl?.url ?? '',
          item.point.clientX,
          item.point.clientY,
          Math.round(item.score),
        ].join('|');
        if (seenCandidates.has(key)) return false;
        seenCandidates.add(key);
        return true;
      })
      .sort((left, right) => (
        (Number(right.accepted) - Number(left.accepted))
        || (right.score - left.score)
      ));
  };
  const resolveTimestampInCard = (card: Element) => {
    const postOpenActionPoints = getPostOpenActionCandidates(card);
    const candidates = getTimestampCandidates(card);
    const seenClickPoints = new Set<string>();
    const timestampClickPoints = candidates
      .map((candidate) => candidate.point)
      .filter((point) => {
        const key = `${point.clientX}:${point.clientY}`;
        if (seenClickPoints.has(key)) return false;
        seenClickPoints.add(key);
        return true;
      })
      .slice(0, 5);
    const seenPostOpenClickPoints = new Set<string>();
    const postOpenClickPoints = [
      ...postOpenActionPoints,
      ...timestampClickPoints,
    ]
      .filter((point) => {
        const key = `${point.clientX}:${point.clientY}`;
        if (seenPostOpenClickPoints.has(key)) return false;
        seenPostOpenClickPoints.add(key);
        return true;
      })
      .slice(0, 8);
    const acceptedCandidates = candidates.filter((candidate) => candidate.accepted);
    for (const candidate of acceptedCandidates.slice(0, 4)) {
      if (isExpectedPostUrl(candidate.hrefPostUrl)) {
        return {
          postUrl: candidate.hrefPostUrl,
          postOpenClickPoints,
          timestampClickPoint: candidate.point,
          timestampClickPoints,
          candidateCount: candidates.length,
        };
      }
    }
    if (acceptedCandidates.length > 0 && acceptedCandidates[0]?.point) {
      return {
        postUrl: null,
        postOpenClickPoints,
        timestampClickPoint: acceptedCandidates[0].point,
        timestampClickPoints,
        candidateCount: candidates.length,
      };
    }

    const fallbackCandidates = candidates.slice(0, 3);
    if (fallbackCandidates.length > 0 && fallbackCandidates[0].point) {
      return {
        postUrl: null,
        postOpenClickPoints,
        timestampClickPoint: fallbackCandidates[0].point,
        timestampClickPoints,
        candidateCount: candidates.length,
      };
    }

    for (const candidate of candidates.slice(0, 5)) {
      if (isExpectedPostUrl(candidate.hrefPostUrl)) {
        return {
          postUrl: candidate.hrefPostUrl,
          postOpenClickPoints,
          timestampClickPoint: null,
          timestampClickPoints,
          candidateCount: candidates.length,
        };
      }
    }

    return {
      postUrl: null,
      postOpenClickPoints,
      timestampClickPoint: candidates[0]?.point ?? postOpenClickPoints[0] ?? null,
      timestampClickPoints,
      candidateCount: candidates.length,
    };
  };

  const currentPostUrl = parsePostUrl(window.location.href);
  const expectedCurrentPostUrl = isExpectedPostUrl(currentPostUrl) ? currentPostUrl : null;
  if (expectedCurrentPostUrl && pageHasSubmittedContentMatch()) {
    return {
      facebookReviewStatus: expectedCurrentPostUrl.pathType === 'posts' ? 'POSTED' : 'PENDING_REVIEW',
      message: 'Current Facebook URL already contains the group post id.',
      externalPostId: expectedCurrentPostUrl.postId,
      externalPostUrl: expectedCurrentPostUrl.url,
    };
  }

  const deadline = Date.now() + 15_000;
  let sawSimilarButNotRecent = false;
  let matchedCardSeen = false;
  let cardsScanned = 0;
  let timestampCandidatesSeen = 0;
  let openCandidatesSeen = 0;
  while (Date.now() < deadline) {
    const bodyText = normalize(document.body?.innerText ?? '');
    const match = findBestCards();
    sawSimilarButNotRecent = sawSimilarButNotRecent || match.sawSimilarButNotRecent;
    for (const matchedCard of match.cards) {
      matchedCardSeen = true;
      cardsScanned += 1;
      const existingUrl = findPostUrlInCard(matchedCard);
      if (existingUrl) {
        return {
          facebookReviewStatus: existingUrl.pathType === 'posts' ? 'POSTED' : 'PENDING_REVIEW',
          message: 'Recovered Facebook group post URL from the matched pending post card.',
          externalPostId: existingUrl.postId,
          externalPostUrl: existingUrl.url,
        };
      }

      const openedTimestamp = resolveTimestampInCard(matchedCard);
      timestampCandidatesSeen += openedTimestamp.candidateCount;
      openCandidatesSeen += openedTimestamp.postOpenClickPoints.length;
      if (openedTimestamp.postUrl) {
        return {
          facebookReviewStatus: openedTimestamp.postUrl.pathType === 'posts' ? 'POSTED' : 'PENDING_REVIEW',
          message: 'Recovered Facebook group post URL by opening the matched pending post timestamp.',
          externalPostId: openedTimestamp.postUrl.postId,
          externalPostUrl: openedTimestamp.postUrl.url,
        };
      }

      if (openedTimestamp.timestampClickPoint || openedTimestamp.postOpenClickPoints.length > 0) {
        return {
          facebookReviewStatus: 'PENDING_REVIEW',
          message: 'Matched pending post card; trusted Facebook click is required to capture the pending post URL.',
          externalPostId: null,
          externalPostUrl: null,
          postOpenClickPoints: openedTimestamp.postOpenClickPoints,
          timestampClickPoint: openedTimestamp.timestampClickPoint ?? openedTimestamp.postOpenClickPoints[0] ?? null,
          timestampClickPoints: openedTimestamp.timestampClickPoints,
        };
      }
    }

    if (hasNoPendingReviewCue(bodyText)) {
      return {
        facebookReviewStatus: 'UNKNOWN',
        message: 'Facebook pending posts manager has no pending posts matching this history.',
        externalPostId: null,
        externalPostUrl: null,
      };
    }

    window.scrollBy({ top: Math.max(420, window.innerHeight * 0.7), behavior: 'auto' });
    await sleepInPage(700);
  }

  return {
    facebookReviewStatus: matchedCardSeen ? 'PENDING_REVIEW' : 'UNKNOWN',
    message: matchedCardSeen
      ? `Matched pending post card but could not find a post-opening control or timestamp click point. cardsScanned=${cardsScanned}; openCandidates=${openCandidatesSeen}; timestampCandidates=${timestampCandidatesSeen}; groupId=${expectedGroupIds[0] ?? 'unknown'}.`
      : sawSimilarButNotRecent
        ? 'Found similar pending post cards, but none were recent enough to confirm this submit.'
        : 'Could not find a matching pending post in the group pending posts manager.',
    externalPostId: null,
    externalPostUrl: null,
  };
}

async function inspectFacebookPendingPostOpenSurfaceInPage(
  input: FacebookPendingPostOpenSurfaceProbeInput,
): Promise<FacebookPendingPostOpenSurfaceProbeResult> {
  const normalize = (value: string) => value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd')
    .replace(/\u0110/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  const shorten = (value: string | null | undefined, maxLength = 140) => {
    const normalized = normalize(value ?? '');
    return normalized.length <= maxLength ? normalized : `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
  };
  const getGroupIdFromUrl = (value: string | null | undefined) => {
    if (!value) return null;
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(value, window.location.href);
    } catch {
      return null;
    }

    const match = parsedUrl.pathname.match(/^\/groups\/([^/]+)/i);
    return match?.[1] ? decodeURIComponent(match[1]).trim() : null;
  };
  const expectedGroupIds = [
    getGroupIdFromUrl(input.targetUrl),
    input.targetExternalId?.trim() ?? null,
  ].filter((value): value is string => Boolean(value));
  const parsePostUrl = (value: string | null | undefined) => {
    if (!value) return null;
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(value, window.location.href);
    } catch {
      return null;
    }

    const hostname = parsedUrl.hostname.toLowerCase();
    if (hostname !== 'facebook.com' && !hostname.endsWith('.facebook.com')) return null;

    const directMatch = parsedUrl.pathname.match(/^\/groups\/([^/]+)\/(posts|pending_posts|permalink)\/([^/?#]+)\/?$/i);
    if (directMatch) {
      const groupId = decodeURIComponent(directMatch[1]).trim();
      const pathType = directMatch[2].toLowerCase() === 'pending_posts' ? 'pending_posts' : 'posts';
      const postId = directMatch[3];
      const suffix = pathType === 'posts' ? '/' : '';
      return {
        groupId,
        pathType: pathType as FacebookGroupPostPathType,
        postId,
        url: `https://www.facebook.com/groups/${encodeURIComponent(groupId)}/${pathType}/${postId}${suffix}`,
      };
    }

    const groupId = getGroupIdFromUrl(parsedUrl.href)
      ?? readNumericSearchParam(parsedUrl, ['id', 'group_id', 'groupid']);
    const postId = readPostIdSearchParam(parsedUrl, ['story_fbid', 'fbid', 'multi_permalinks', 'post_id', 'postid']);
    if (!groupId || !postId) return null;

    return {
      groupId,
      pathType: 'posts' as FacebookGroupPostPathType,
      postId,
      url: `https://www.facebook.com/groups/${encodeURIComponent(groupId)}/posts/${postId}/`,
    };
  };
  const readNumericSearchParam = (parsedUrl: URL, names: string[]) => {
    for (const name of names) {
      const value = parsedUrl.searchParams.get(name);
      const match = value?.match(/\d{5,}/);
      if (match?.[0]) return match[0];
    }

    return null;
  };
  const readPostIdSearchParam = (parsedUrl: URL, names: string[]) => {
    for (const name of names) {
      const value = parsedUrl.searchParams.get(name);
      const match = value?.match(/(?:\d{5,}|pfbid[a-z0-9]+)/i);
      if (match?.[0]) return match[0];
    }

    return null;
  };
  const isExpectedPostUrl = (value: ReturnType<typeof parsePostUrl>) => (
    Boolean(value) && (expectedGroupIds.length === 0 || expectedGroupIds.includes(value?.groupId ?? ''))
  );
  const isVisible = (element: Element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0
      && rect.height > 0
      && style.visibility !== 'hidden'
      && style.display !== 'none'
      && rect.bottom >= 0
      && rect.top <= window.innerHeight + 80;
  };
  const textOf = (element: Element) => normalize([
    element.textContent ?? '',
    element.getAttribute('aria-label') ?? '',
    element.getAttribute('title') ?? '',
  ].join(' '));
  const elementAttributeText = (element: Element) => normalize([
    element.getAttribute('aria-label') ?? '',
    element.getAttribute('title') ?? '',
    element.getAttribute('aria-haspopup') ?? '',
  ].join(' '));
  const directTextOf = (element: Element) => normalize([
    Array.from(element.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent ?? '')
      .join(' '),
    elementAttributeText(element),
  ].join(' '));
  const getClickableElement = (element: Element) => (
    element.closest('a[href], [role="link"], [role="button"], button, [tabindex]') ?? element
  );
  const hasPostOpenActionText = (text: string) => (
    /(^|\s)(quan ly bai viet|manage (?:your )?posts?|xem bai viet|view (?:your )?post|open post|go to post|see post|review post|xem chi tiet|chi tiet bai viet|xem bai dang|mo bai viet|truy cap bai viet)(?=\s|$|[.,;:!?])/.test(text)
  );
  const isSemanticLink = (element: Element, clickable: Element) => (
    element instanceof HTMLAnchorElement
      || clickable instanceof HTMLAnchorElement
      || element.getAttribute('role') === 'link'
      || clickable.getAttribute('role') === 'link'
  );
  const buildPoint = (rect: DOMRect, label: string): FacebookSubmitButtonPoint => ({
    clientX: Math.round(rect.left + rect.width / 2),
    clientY: Math.round(rect.top + rect.height / 2),
    label,
    rect: {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    },
  });
  const summarizeElement = (element: Element | null) => {
    if (!element) return 'none';
    const clickable = getClickableElement(element);
    const target = clickable === element ? element : clickable;
    const tag = target.tagName.toLowerCase();
    const role = target.getAttribute('role') ?? 'none';
    const href = target instanceof HTMLAnchorElement ? target.href : target.getAttribute('href');
    return `${tag}[role=${role}] text="${shorten(textOf(target) || textOf(element), 100)}" href="${shorten(href, 120)}"`;
  };

  const currentPostUrl = parsePostUrl(window.location.href);
  if (isExpectedPostUrl(currentPostUrl)) {
    return {
      externalPostUrl: currentPostUrl?.url ?? null,
      clickPoints: [],
      diagnostics: 'surface=current-url-post',
    };
  }

  const expectedLinks = Array.from(document.querySelectorAll('a[href]'))
    .filter(isVisible)
    .map((link) => parsePostUrl(link.getAttribute('href')))
    .filter((postUrl): postUrl is NonNullable<typeof postUrl> => isExpectedPostUrl(postUrl));
  if (expectedLinks[0]) {
    return {
      externalPostUrl: expectedLinks[0].url,
      clickPoints: [],
      diagnostics: `surface=expected-link; postLinks=${expectedLinks.length}`,
    };
  }

  const overlayRoots = Array.from(document.querySelectorAll('[role="dialog"], [role="menu"], [aria-modal="true"]'))
    .filter(isVisible);
  const roots = [
    ...overlayRoots,
    document.body,
  ].filter((root): root is Element => Boolean(root));
  const seenTargets = new Set<Element>();
  const actionCandidates = roots
    .flatMap((root) => Array.from(root.querySelectorAll('a[href], [role="link"], [role="button"], button, [tabindex], span, div')))
    .filter(isVisible)
    .map((element) => {
      const clickable = getClickableElement(element);
      const target = clickable === element ? element : clickable;
      if (seenTargets.has(target)) return null;
      seenTargets.add(target);
      if (!isVisible(target)) return null;

      const hrefPostUrl = parsePostUrl(
        target instanceof HTMLAnchorElement
          ? target.href
          : element instanceof HTMLAnchorElement
            ? element.href
            : target.getAttribute('href') ?? element.getAttribute('href'),
      );
      if (isExpectedPostUrl(hrefPostUrl)) {
        return {
          point: buildPoint(target.getBoundingClientRect(), 'Facebook pending post exposed URL action'),
          score: 1_000,
          label: textOf(target) || textOf(element),
        };
      }

      const targetText = textOf(target);
      const elementText = textOf(element);
      const actionText = normalize([
        directTextOf(element),
        elementAttributeText(element),
        elementText.length <= 220 ? elementText : '',
        clickable !== element ? directTextOf(clickable) : '',
        clickable !== element ? elementAttributeText(clickable) : '',
        clickable !== element && targetText.length <= 220 ? targetText : '',
      ].join(' '));
      if (!hasPostOpenActionText(actionText)) return null;

      const rect = target.getBoundingClientRect();
      const semantic = isSemanticLink(element, clickable)
        || clickable.getAttribute('role') === 'button'
        || clickable instanceof HTMLButtonElement;
      const inOverlay = overlayRoots.some((root) => root === target || root.contains(target));
      const compact = rect.width <= Math.min(window.innerWidth * 0.82, 420) && rect.height <= 82;
      const score = (inOverlay ? 420 : 0)
        + (semantic ? 160 : 0)
        + (compact ? 80 : 0)
        + (/(^|\s)(xem bai viet|view (?:your )?post|open post|go to post|see post|xem bai dang|mo bai viet)(?=\s|$|[.,;:!?])/.test(actionText) ? 260 : 140)
        - Math.max(0, rect.width - 320) / 8;
      if (score < 180) return null;

      return {
        point: buildPoint(rect, 'Facebook pending post opened-surface action'),
        score,
        label: actionText,
      };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
    .sort((left, right) => right.score - left.score);

  const seenPoints = new Set<string>();
  const clickPoints = actionCandidates
    .map((candidate) => candidate.point)
    .filter((point) => {
      const key = `${point.clientX}:${point.clientY}`;
      if (seenPoints.has(key)) return false;
      seenPoints.add(key);
      return true;
    })
    .slice(0, 5);
  const clickedElement = input.clickPoint
    ? document.elementFromPoint(input.clickPoint.clientX, input.clickPoint.clientY)
    : null;
  const overlaySummaries = overlayRoots
    .slice(0, 3)
    .map((root) => `${root.getAttribute('role') ?? 'surface'}:"${shorten(textOf(root), 120)}"`);
  const candidateLabels = actionCandidates
    .slice(0, 5)
    .map((candidate) => shorten(candidate.label, 80));
  const mismatchedPostLinks = Array.from(document.querySelectorAll('a[href]'))
    .filter(isVisible)
    .map((link) => parsePostUrl(link.getAttribute('href')))
    .filter((postUrl): postUrl is NonNullable<typeof postUrl> => Boolean(postUrl) && !isExpectedPostUrl(postUrl))
    .slice(0, 3)
    .map((postUrl) => postUrl.url);

  return {
    externalPostUrl: null,
    clickPoints,
    diagnostics: [
      `clickElement=${summarizeElement(clickedElement)}`,
      `surfaceRoots=${overlayRoots.length}`,
      overlaySummaries.length > 0 ? `surfaces=${overlaySummaries.join(' | ')}` : null,
      `surfaceCandidates=${clickPoints.length}`,
      candidateLabels.length > 0 ? `surfaceLabels=${candidateLabels.join(' | ')}` : null,
      mismatchedPostLinks.length > 0 ? `mismatchedPostLinks=${mismatchedPostLinks.join(',')}` : null,
      `currentUrl=${shorten(window.location.href, 180)}`,
    ].filter(Boolean).join('; '),
  };
}

async function checkFacebookPostReviewStatusInPage(
  input: FacebookPostReviewStatusProbeInput,
): Promise<FacebookPostReviewStatusProbeResult> {
  const sleepInPage = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const normalize = (value: string) => value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd')
    .replace(/\u0110/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  const bodyText = () => normalize(document.body?.innerText ?? '');
  const hasRejectedCue = (text: string) => (
    /rejected|declined|not approved|was removed|has been removed|tu choi|bi tu choi|khong duoc phe duyet|da bi go/.test(text)
  );
  const hasDeletedCue = (text: string) => (
    /content isn't available|this content isn't available|noi dung nay khong hien co|khong tim thay noi dung|page isn't available|this page isn't available|link may be broken|page may have been removed|trang nay khong kha dung|trang nay khong hien thi|lien ket da hong|trang da bi go|bai viet nay da bi xoa|post was deleted|post has been deleted/.test(text)
  );
  const hasPendingCue = (text: string) => (
    /pending|waiting for approval|cho duyet|cho phe duyet|dang cho|quan tri vien phe duyet|admin approval/.test(text)
  );
  const queryAll = (root: Document | Element, selector: string) => Array.from(root.querySelectorAll(selector));
  const hasLayout = (element: Element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0
      && rect.height > 0
      && style.visibility !== 'hidden'
      && style.display !== 'none';
  };
  const elementLabel = (element: Element) => normalize([
    element.textContent ?? '',
    element.getAttribute('aria-label') ?? '',
    element.getAttribute('title') ?? '',
    element.getAttribute('role') ?? '',
  ].join(' '));
  const getClickableElement = (element: Element) => (
    element.closest('[role="button"], button, a[href], [tabindex]') ?? element
  );
  const makeSearchSamples = () => {
    const values = [input.title, input.contentPreview]
      .map((value) => normalize(value ?? ''))
      .filter((value) => value.length >= 16);

    return values.flatMap((value) => {
      const compact = value.slice(0, 140);
      const words = value.split(' ').filter((word) => word.length > 2);
      const wordSample = words.slice(0, 12).join(' ');
      return [compact, wordSample].filter((sample) => sample.length >= 16);
    });
  };
  const samples = [...new Set(makeSearchSamples())];
  const titleSamples = [...new Set([
    normalize(input.title ?? ''),
    ...normalize(input.title ?? '').split(/\s*[-:|]\s*/).map((part) => part.trim()),
  ].filter((sample) => sample.length >= 8))];
  const contentPreviewSamples = [...new Set(
    normalize(input.contentPreview ?? '')
      .split(/\r?\n+/)
      .flatMap((line) => [line.trim(), line.trim().slice(0, 140)])
      .filter((sample) => sample.length >= 24),
  )];
  const isBoundaryCharacter = (value: string | undefined) => !value || !/[a-z0-9]/i.test(value);
  const containsPhrase = (text: string, sample: string) => {
    let index = text.indexOf(sample);
    while (index >= 0) {
      const before = text[index - 1];
      const after = text[index + sample.length];
      if (isBoundaryCharacter(before) && isBoundaryCharacter(after)) return true;
      index = text.indexOf(sample, index + 1);
    }

    return false;
  };
  const containsTitlePhrase = (text: string, sample: string) => {
    let index = text.indexOf(sample);
    while (index >= 0) {
      const before = text[index - 1];
      const after = text[index + sample.length];
      const facebookJoinedNextWord = /\d$/.test(sample) && Boolean(after) && /[a-z]/i.test(after);
      if (isBoundaryCharacter(before) && (isBoundaryCharacter(after) || facebookJoinedNextWord)) return true;
      index = text.indexOf(sample, index + 1);
    }

    return false;
  };
  const scoreSamplesInText = (text: string, sampleValues: string[], exactMultiplier: number) => (
    sampleValues.reduce((score, sample) => {
      if (containsPhrase(text, sample)) return score + Math.min(360, sample.length * exactMultiplier);
      if (text.includes(sample)) return score + Math.min(240, sample.length * 3);
      if (sample.length >= 40 && text.includes(sample.slice(0, 40))) return score + 80;
      if (sample.length >= 24 && text.includes(sample.slice(0, 24))) return score + 40;
      return score;
    }, 0)
  );
  const scoreTitleSamplesInText = (text: string) => (
    titleSamples.reduce((score, sample) => (
      containsTitlePhrase(text, sample) ? score + Math.min(360, sample.length * 6) : score
    ), 0)
  );
  const titleTokens = normalize(input.title ?? '')
    .split(/[^a-z0-9]+/i)
    .filter((word) => word.length >= 3);
  const hasDistinctiveTitleToken = titleTokens.some((word) => /\d/.test(word) || word.length >= 5);
  const getTitleTokenScore = (text: string) => {
    if (titleTokens.length < 3 || !hasDistinctiveTitleToken) return 0;
    return titleTokens.every((word) => containsPhrase(text, word)) ? 90 : 0;
  };
  const hasSubmittedContentMatch = (value: string) => {
    const text = normalize(value);
    if (text.length < 8) return samples.length === 0;

    const titleScore = scoreTitleSamplesInText(text) + getTitleTokenScore(text);
    const previewScore = scoreSamplesInText(text, contentPreviewSamples, 4);
    const sampleScore = scoreSamplesInText(text, samples, 3);
    const hasTitleRequirement = titleSamples.length > 0;
    return samples.length === 0
      || titleScore > 0
      || (!hasTitleRequirement && (previewScore > 0 || sampleScore >= 80));
  };
  const containsSubmittedPost = () => {
    if (samples.length === 0) return false;

    const candidates = [
      bodyText(),
      ...Array.from(document.querySelectorAll('[role="article"], article, [data-pagelet*="FeedUnit"], [role="dialog"]'))
        .map((element) => normalize(element.textContent ?? '')),
    ];

    return candidates.some((candidate) => (
      candidate.length >= 40
      && hasSubmittedContentMatch(candidate)
    ));
  };
  const getSubmittedPostRoots = () => {
    const candidates = queryAll(document, '[role="dialog"], [role="article"], article, [data-pagelet*="FeedUnit"]');
    const roots = candidates
      .filter(hasLayout)
      .filter((element) => hasSubmittedContentMatch(elementLabel(element)));

    if (roots.length > 0) return roots;

    const dialogs = candidates.filter((element) => (
      element.getAttribute('role') === 'dialog' && hasLayout(element)
    ));
    if (dialogs.length === 1) return dialogs;

    const articles = candidates.filter((element) => (
      element.matches('[role="article"], article, [data-pagelet*="FeedUnit"]') && hasLayout(element)
    ));
    if (articles.length === 1) return articles;

    return containsSubmittedPost() ? [document.body] : [];
  };
  const scrollSubmittedPostToActions = async () => {
    const roots = getSubmittedPostRoots();
    const scrollables = new Set<Element>();

    if (document.scrollingElement) scrollables.add(document.scrollingElement);
    for (const root of roots) {
      const descendants = queryAll(root, '*').slice(0, 2_000);
      for (const candidate of [root, ...descendants]) {
        if (candidate.scrollHeight > candidate.clientHeight + 40) {
          scrollables.add(candidate);
        }
      }
    }

    let stablePasses = 0;
    let previousSignature = '';
    let maxScrollHeight = 0;
    let lastScrollTop = 0;
    let passes = 0;
    for (; passes < 12; passes += 1) {
      for (const scrollable of scrollables) {
        scrollable.scrollTop = Math.max(0, scrollable.scrollHeight - scrollable.clientHeight);
        maxScrollHeight = Math.max(maxScrollHeight, scrollable.scrollHeight);
        lastScrollTop = Math.max(lastScrollTop, scrollable.scrollTop);
      }
      const documentHeight = document.scrollingElement?.scrollHeight ?? document.body.scrollHeight;
      window.scrollTo(0, Math.max(0, documentHeight - window.innerHeight));
      await sleepInPage(260);

      const signature = [...scrollables]
        .map((scrollable) => `${Math.round(scrollable.scrollTop)}:${Math.round(scrollable.scrollHeight)}`)
        .join('|');
      if (signature === previousSignature) stablePasses += 1;
      else stablePasses = 0;
      previousSignature = signature;
      if (stablePasses >= 3) break;
    }

    return {
      passes: Math.min(passes + 1, 12),
      scrollableCount: scrollables.size,
      stablePasses,
      maxScrollHeight,
      lastScrollTop,
    };
  };
  type PostActionKind = 'LIKE' | 'COMMENT' | 'SEND';
  const getPostActionKind = (label: string): PostActionKind | null => {
    if (/(^|\s)(binh luan|comment)(?=\s|$|[.,;:!?])/.test(label)) return 'COMMENT';
    if (/(^|\s)(gui|send|share|chia se)(?=\s|$|[.,;:!?])/.test(label)) return 'SEND';
    if (/(^|\s)(thich|like|react|bay to cam xuc)(?=\s|$|[.,;:!?])/.test(label)) return 'LIKE';
    return null;
  };
  const getPostEngagementActionState = () => {
    const roots = getSubmittedPostRoots();
    const sourceRoots = roots.length > 0 ? roots : [document.body];
    const seenTargets = new Set<Element>();
    const actions = sourceRoots
      .flatMap((root) => queryAll(root, '[role="button"], button, a[href], [tabindex]'))
      .filter(hasLayout)
      .map((element) => {
        const target = getClickableElement(element);
        if (seenTargets.has(target) || !hasLayout(target)) return null;
        seenTargets.add(target);

        const label = normalize(`${elementLabel(element)} ${elementLabel(target)}`);
        const kind = getPostActionKind(label);
        if (!kind) return null;

        const rect = target.getBoundingClientRect();
        const maxActionWidth = Math.max(520, window.innerWidth * 0.8);
        if (rect.height > 64 || rect.width < 12 || rect.width > maxActionWidth) return null;

        return {
          kind,
          label,
          centerX: rect.left + rect.width / 2,
          centerY: rect.top + rect.height / 2,
        };
      })
      .filter((action): action is NonNullable<typeof action> => Boolean(action));

    const likes = actions.filter((action) => action.kind === 'LIKE');
    const comments = actions.filter((action) => action.kind === 'COMMENT');
    const sends = actions.filter((action) => action.kind === 'SEND');
    const sameRow = (left: typeof actions[number], right: typeof actions[number]) => (
      Math.abs(left.centerY - right.centerY) <= 48
    );

    for (const like of likes) {
      for (const send of sends) {
        if (!sameRow(like, send) || Math.abs(like.centerX - send.centerX) < 90) continue;
        const leftX = Math.min(like.centerX, send.centerX);
        const rightX = Math.max(like.centerX, send.centerX);
        const commentBetween = comments.some((comment) => (
          sameRow(comment, like)
            && comment.centerX > leftX + 24
            && comment.centerX < rightX - 24
        ));

        return {
          hasLikeAndSendRow: true,
          hasCommentBetweenLikeAndSend: commentBetween,
          rootCount: roots.length,
          actionCount: actions.length,
          labels: actions.map((action) => action.label).slice(0, 8),
        };
      }
    }

    return {
      hasLikeAndSendRow: false,
      hasCommentBetweenLikeAndSend: false,
      rootCount: roots.length,
      actionCount: actions.length,
      labels: actions.map((action) => action.label).slice(0, 8),
    };
  };
  let lastActionState: ReturnType<typeof getPostEngagementActionState> = {
    hasLikeAndSendRow: false,
    hasCommentBetweenLikeAndSend: false,
    rootCount: 0,
    actionCount: 0,
    labels: [],
  };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await sleepInPage(attempt === 0 ? 0 : 900);
    await scrollSubmittedPostToActions();
    lastActionState = getPostEngagementActionState();
    const text = bodyText();
    const submittedPostVisible = containsSubmittedPost() || lastActionState.hasLikeAndSendRow;

    if (lastActionState.hasCommentBetweenLikeAndSend) {
      return {
        facebookReviewStatus: 'POSTED',
        message: 'Bài viết đã được đăng thành công trên Facebook.',
        externalPostUrl: window.location.href,
      };
    }

    if (lastActionState.hasLikeAndSendRow) {
      return {
        facebookReviewStatus: 'PENDING_REVIEW',
        message: 'Bài viết đang chờ Facebook xét duyệt.',
        externalPostUrl: input.externalPostUrl ?? window.location.href,
      };
    }

    if (!submittedPostVisible && hasDeletedCue(text)) {
      return {
        facebookReviewStatus: 'DELETED',
        message: 'Facebook post URL loaded but the post content is unavailable or deleted.',
        externalPostUrl: input.externalPostUrl ?? window.location.href,
      };
    }

    if (hasRejectedCue(text)) {
      return {
        facebookReviewStatus: 'REJECTED',
        message: 'Facebook shows a clear rejected/removed signal for this post.',
        externalPostUrl: window.location.href,
      };
    }

    if (hasPendingCue(text) && (submittedPostVisible || input.expectedPathType === 'pending_posts')) {
      return {
        facebookReviewStatus: 'PENDING_REVIEW',
        message: 'Facebook still indicates that this post is pending approval.',
        externalPostUrl: input.externalPostUrl ?? null,
      };
    }

    window.scrollBy({ top: Math.max(420, window.innerHeight * 0.7), behavior: 'auto' });
  }

  lastActionState = getPostEngagementActionState();
  if (lastActionState.hasCommentBetweenLikeAndSend) {
    return {
      facebookReviewStatus: 'POSTED',
      message: 'Bài viết đã được đăng thành công trên Facebook.',
      externalPostUrl: window.location.href,
    };
  }

  if (lastActionState.hasLikeAndSendRow) {
    return {
      facebookReviewStatus: 'PENDING_REVIEW',
      message: 'Bài viết đang chờ Facebook xét duyệt.',
      externalPostUrl: input.externalPostUrl ?? window.location.href,
    };
  }

  return {
    facebookReviewStatus: 'UNKNOWN',
    message: 'Chưa thể xác định trạng thái bài viết trên Facebook.',
    externalPostUrl: input.externalPostUrl ?? null,
  };
}

async function waitForFacebookSubmissionInPage(
  content: string,
  diagnosticInput: FacebookSubmitDiagnosticInput = {},
): Promise<FacebookPagePublishResult> {
  const sleepInPage = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const normalize = (value: string) => value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd')
    .replace(/\u0110/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  const shorten = (value: string | null | undefined, maxLength = 160) => {
    const normalized = normalize(value ?? '');
    if (normalized.length <= maxLength) return normalized || 'none';
    return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
  };
  const hashText = (value: string) => {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
      hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
    }

    return Math.abs(hash).toString(36);
  };
  const rectValue = (element: Element | null | undefined) => {
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  };
  const formatRect = (rect: FacebookSubmitButtonPoint['rect'] | null | undefined) => (
    rect ? `(${rect.left},${rect.top},${rect.width},${rect.height})` : 'none'
  );
  const formatPoint = (point: FacebookSubmitButtonPoint | null | undefined) => (
    point ? `(${Math.round(point.clientX)},${Math.round(point.clientY)})` : 'none'
  );
  const getTargetGroupId = () => {
    if (diagnosticInput.targetExternalId) return diagnosticInput.targetExternalId;
    if (!diagnosticInput.targetUrl) return 'unknown';

    try {
      const parsedUrl = new URL(diagnosticInput.targetUrl, window.location.href);
      const match = parsedUrl.pathname.match(/^\/groups\/([^/]+)/i);
      return match?.[1] ? decodeURIComponent(match[1]) : 'unknown';
    } catch {
      return 'unknown';
    }
  };
  const getExpectedGroupIds = () => {
    const safeDecode = (value: string | null | undefined) => {
      if (!value) return null;
      try {
        return decodeURIComponent(value).trim().replace(/^\/+|\/+$/g, '');
      } catch {
        return value.trim().replace(/^\/+|\/+$/g, '');
      }
    };
    const normalizeGroupId = (value: string | null | undefined) => safeDecode(value);

    const targetId = normalizeGroupId(diagnosticInput.targetExternalId);
    const targetUrlId = (() => {
      if (!diagnosticInput.targetUrl) return null;
      try {
        const parsedUrl = new URL(diagnosticInput.targetUrl, window.location.href);
        const match = parsedUrl.pathname.match(/^\/groups\/([^/]+)/i);
        return match?.[1] ? safeDecode(match[1]) : null;
      } catch {
        return null;
      }
    })();

    return [targetId, targetUrlId].filter((value): value is string => Boolean(value));
  };
  const expectedGroupIds = getExpectedGroupIds();
  const parsePostUrlFromLocation = (value: string | null | undefined) => {
    const rawUrl = value?.trim();
    if (!rawUrl) return null;

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      try {
        parsedUrl = new URL(rawUrl, window.location.href);
      } catch {
        return null;
      }
    }

    const hostname = parsedUrl.hostname.toLowerCase();
    if (hostname !== 'facebook.com' && !hostname.endsWith('.facebook.com')) return null;

    const match = parsedUrl.pathname.match(/^\/groups\/([^/]+)\/(posts|pending_posts)\/([^/?#]+)\/?$/i);
    if (!match) return null;

    const safeDecode = (value: string | null | undefined) => {
      if (!value) return '';
      try {
        return decodeURIComponent(value).trim();
      } catch {
        return value.trim();
      }
    };

    const groupId = safeDecode(match[1]);
    const pathType = match[2].toLowerCase();
    const postId = (match[3] ?? '').trim();
    if (!groupId || !postId) return null;

    const suffix = pathType === 'posts' ? '/' : '';
    return {
      groupId,
      pathType: pathType === 'posts' ? 'posts' : 'pending_posts',
      postId,
      url: `https://www.facebook.com/groups/${encodeURIComponent(groupId)}/${pathType}/${postId}${suffix}`,
    };
  };
  const isExpectedSubmitPost = (postUrl: ReturnType<typeof parsePostUrlFromLocation> | null) => (
    !postUrl ? false : expectedGroupIds.length === 0 || expectedGroupIds.includes(postUrl.groupId)
  );
  const POST_BUTTON_PATTERNS = [
    /^post$/,
    /^dang$/,
    /^post post$/,
    /^dang dang$/,
    /^post to group$/,
    /^dang bai$/,
    /^dang tin$/,
    /^dang len nhom$/,
    /^dang vao nhom$/,
  ];
  const COMMENT_PATTERNS = [
    /write a comment/,
    /add a comment/,
    /comment as/,
    /reply/,
    /binh luan/,
    /viet binh luan/,
    /tra loi/,
    /viet phan hoi/,
  ];
  const CHAT_SURFACE_PATTERNS = [
    /messenger/,
    /^chats?$/,
    /chat/,
    /message/,
    /write a message/,
    /nhap tin nhan/,
    /tin nhan/,
    /doan chat/,
    /cuoc tro chuyen/,
    /goi thoai/,
    /goi video/,
    /voice call/,
    /video call/,
    /minimize chat/,
    /close chat/,
    /dong doan chat/,
    /thu nho/,
    /dang hoat dong/,
    /active now/,
  ];
  const CHAT_EDITOR_PATTERNS = [
    /^aa$/,
    /write a message/,
    /nhap tin nhan/,
    /message/,
    /tin nhan/,
  ];
  const POST_COMPOSER_PATTERNS = [
    /write something/,
    /create a public post/,
    /create post/,
    /start a post/,
    /what.?s on your mind/,
    /ban viet gi/,
    /viet gi/,
    /tao bai viet/,
  ];
  const queryAll = (root: Document | Element, selector: string) => (
    Array.from(root.querySelectorAll(selector))
  );
  const isVisible = (element: Element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0
      && rect.height > 0
      && style.visibility !== 'hidden'
      && style.display !== 'none';
  };
  const elementLabel = (element: Element) => normalize([
    element.textContent ?? '',
    element.getAttribute('aria-label') ?? '',
    element.getAttribute('aria-placeholder') ?? '',
    element.getAttribute('placeholder') ?? '',
    element.getAttribute('title') ?? '',
  ].join(' '));
  const elementAttributeLabel = (element: Element) => normalize([
    element.getAttribute('aria-label') ?? '',
    element.getAttribute('aria-placeholder') ?? '',
    element.getAttribute('placeholder') ?? '',
    element.getAttribute('title') ?? '',
  ].join(' '));
  const matchesAny = (label: string, patterns: RegExp[]) => patterns.some((pattern) => pattern.test(label));
  const isSubmitLabel = (label: string) => matchesAny(label, POST_BUTTON_PATTERNS);
  const isCommentLabel = (label: string) => matchesAny(label, COMMENT_PATTERNS);
  const isChatEditor = (element: Element) => {
    const attributeLabel = elementAttributeLabel(element);
    const shortText = normalize((element.textContent ?? '').trim());
    return matchesAny(attributeLabel, CHAT_EDITOR_PATTERNS)
      || shortText === 'aa';
  };
  const hasChatControls = (root: Document | Element) => queryAll(
    root,
    '[aria-label], [title], button, [role="button"]',
  )
    .some((element) => matchesAny(elementAttributeLabel(element), CHAT_SURFACE_PATTERNS));
  const isDockedChatLikeSurface = (element: Element) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 180
      && rect.width <= 560
      && rect.height > 80
      && rect.height <= Math.max(640, window.innerHeight * 0.9)
      && rect.bottom >= window.innerHeight - 12
      && rect.right >= window.innerWidth * 0.45
      && hasChatControls(element);
  };
  const isChatSurface = (element: Element) => {
    const attributeLabel = elementAttributeLabel(element);
    const text = normalize((element.textContent ?? '').trim());
    const compactText = text.length <= 80 ? text : '';
    return isChatEditor(element)
      || matchesAny(attributeLabel, CHAT_SURFACE_PATTERNS)
      || /^aa$|dang hoat dong|active now|doan chat|cuoc tro chuyen/.test(compactText)
      || isDockedChatLikeSurface(element);
  };
  const getClickableElement = (element: Element) => (
    element.closest('button, [role="button"], [tabindex], a') ?? element
  );
  const isDisabled = (element: Element) => {
    const clickable = getClickableElement(element);
    return clickable.hasAttribute('disabled')
      || clickable.getAttribute('aria-disabled') === 'true';
  };
  const isInsideCommentSurface = (element: Element) => {
    if (isCommentLabel(elementLabel(element)) || isChatSurface(element)) return true;

    let current = element.parentElement;
    let depth = 0;
    while (current && depth < 9) {
      const label = elementLabel(current);
      if (matchesAny(label, POST_COMPOSER_PATTERNS) || isSubmitLabel(label)) return false;
      if (isCommentLabel(label) || isChatSurface(current)) return true;
      current = current.parentElement;
      depth += 1;
    }

    return false;
  };
  const findSubmitButton = (root: Document | Element) => {
    const uniqueClickables = new Set<Element>();

    return queryAll(root, 'button, [role="button"], [tabindex], a, span, div')
      .map((element) => ({
        source: element,
        clickable: getClickableElement(element),
      }))
      .filter(({ source, clickable }) => {
        if (uniqueClickables.has(clickable)) return false;
        uniqueClickables.add(clickable);
        if (!isVisible(clickable) || isInsideCommentSurface(source)) return false;
        const labels = [elementLabel(source), elementLabel(clickable)].filter(Boolean);
        return labels.some(isSubmitLabel);
      })[0]?.clickable ?? null;
  };
  const hasPostSubmitControl = (root: Document | Element) => {
    const uniqueClickables = new Set<Element>();

    return queryAll(root, 'button, [role="button"], [tabindex], a, span, div')
      .map((element) => ({
        source: element,
        clickable: getClickableElement(element),
      }))
      .some(({ source, clickable }) => {
        if (uniqueClickables.has(clickable)) return false;
        uniqueClickables.add(clickable);
        if (!isVisible(clickable) || isInsideCommentSurface(source)) return false;
        const labels = [elementLabel(source), elementLabel(clickable)].filter(Boolean);
        return labels.some(isSubmitLabel);
      });
  };
  const hasPostComposerCue = (root: Document | Element) => {
    const rootElement = root instanceof Document ? root.body : root;
    if (rootElement && matchesAny(elementLabel(rootElement), POST_COMPOSER_PATTERNS)) return true;

    return queryAll(root, '[aria-label], [aria-placeholder], [placeholder], [title]')
      .some((element) => matchesAny(elementAttributeLabel(element), POST_COMPOSER_PATTERNS));
  };
  const findPostSurfaceForEditor = (editor: HTMLElement): Element | null => {
    if (isInsideCommentSurface(editor)) return null;

    let current = editor.parentElement;
    let depth = 0;
    while (current && current !== document.body && depth < 10) {
      if (isInsideCommentSurface(current)) return null;

      const hasComposerCue = hasPostComposerCue(current);
      const hasSubmitControl = hasPostSubmitControl(current);
      const isDialog = current.getAttribute('role') === 'dialog';
      if (
        (hasComposerCue && (hasSubmitControl || isDialog))
        || (isDialog && hasSubmitControl)
      ) {
        return current;
      }

      current = current.parentElement;
      depth += 1;
    }

    return null;
  };
  const findPostEditor = (root: Document | Element) => queryAll(
    root,
    '[contenteditable="true"][role="textbox"], [contenteditable="true"]',
  )
    .filter((element): element is HTMLElement => element instanceof HTMLElement)
    .filter((element) => isVisible(element))
    .find((element) => Boolean(findPostSurfaceForEditor(element))) ?? null;
  const readPostSurfaceState = () => {
    const dialogs = queryAll(document, '[role="dialog"]')
      .filter((element) => isVisible(element))
      .filter((element) => !isInsideCommentSurface(element));
    const roots = [...dialogs, document];
    const editor = roots
      .map((root) => findPostEditor(root))
      .find((element): element is HTMLElement => Boolean(element)) ?? null;
    const submitButton = roots
      .map((root) => findSubmitButton(root))
      .find((element): element is Element => Boolean(element)) ?? null;
    const contentSample = normalize(content).slice(0, 24);
    const editorText = normalize(editor?.innerText || editor?.textContent || '');
    const submitButtonLabel = submitButton ? elementLabel(submitButton) : 'none';
    const submitButtonRect = rectValue(submitButton);

    return {
      hasPostSurface: Boolean(editor || submitButton),
      contentInEditor: Boolean(editor && (!contentSample || editorText.includes(contentSample))),
      editorTextLength: editorText.length,
      submitButtonFound: Boolean(submitButton),
      submitButtonDisabled: submitButton ? isDisabled(submitButton) : false,
      submitButtonLabel,
      submitButtonRect,
    };
  };
  const readBodyErrorCue = () => {
    const text = normalize(document.body?.innerText ?? '');
    const match = text.match(/.{0,80}(something went wrong|try again later|try again|couldn.?t post|temporarily blocked|you.?re temporarily blocked|spam|rate limit|khong the dang|thu lai sau|thu lai|tam thoi bi chan|bi chan|gioi han).{0,120}/);
    return match?.[0] ? shorten(match[0], 220) : null;
  };
  const readElementAtClickPoint = () => {
    const point = diagnosticInput.clickPoint;
    if (!point) {
      return {
        label: 'none',
        tag: 'none',
        role: 'none',
        matchesSubmit: false,
      };
    }

    const hit = document.elementFromPoint(point.clientX, point.clientY);
    const clickable = hit?.closest?.('button, [role="button"], [tabindex], a') ?? hit;
    const label = clickable ? elementLabel(clickable) || (hit ? elementLabel(hit) : '') : 'none';
    return {
      label: shorten(label, 120),
      tag: clickable?.tagName?.toLowerCase?.() ?? hit?.tagName?.toLowerCase?.() ?? 'none',
      role: clickable?.getAttribute?.('role') ?? hit?.getAttribute?.('role') ?? 'none',
      matchesSubmit: Boolean(clickable && isSubmitLabel(label)),
    };
  };
  const readBlockingCue = () => {
    const elements = queryAll(
      document,
      '[role="dialog"], [aria-modal="true"], [role="alert"], [role="status"], [aria-live]',
    )
      .filter((element) => isVisible(element))
      .filter((element) => !isInsideCommentSurface(element));

    for (const element of elements) {
      const text = elementLabel(element);
      if (
        /captcha|security check|checkpoint|confirm your identity|unusual activity|temporarily blocked|try again later|rate limit|spam|login|log in|dang nhap|xac minh|hoat dong bat thuong|tam thoi bi chan|bi chan|gioi han|ma bao mat/.test(text)
      ) {
        return shorten(text, 240);
      }
    }

    return null;
  };
  const readSubmissionError = () => {
    const bodyErrorCue = readBodyErrorCue();
    return bodyErrorCue
      ? buildSubmitDiagnosticMessage(
        'FB_SUBMIT_FACEBOOK_ERROR',
        'Facebook returned a post submission error.',
        readPostSurfaceState(),
        { bodyErrorCue },
      )
      : null;
  };
  const contentSamples = (() => {
    const normalizedContent = normalize(content);
    const lines = content
      .split(/\r?\n+/)
      .map((line) => normalize(line))
      .filter((line) => line.length >= 12);
    const words = normalizedContent.split(' ').filter((word) => word.length > 2);

    return [...new Set([
      lines[0]?.slice(0, 120) ?? '',
      normalizedContent.slice(0, 120),
      words.slice(0, 14).join(' '),
      ...lines.slice(1, 4).map((line) => line.slice(0, 100)),
    ].filter((sample) => sample.length >= 12))];
  })();
  const textMatchesSubmittedContent = (text: string) => (
    contentSamples.some((sample) => text.includes(sample) || (sample.length >= 32 && text.includes(sample.slice(0, 32))))
  );
  const pendingSubmissionPattern = /pending approval|waiting for approval|awaiting approval|dang cho.{0,120}phe duyet|dang cho.{0,120}xet duyet|cho quan tri vien phe duyet|bai viet.{0,120}cho.{0,120}phe duyet|bai viet.{0,120}dang cho/;
  const submittedPattern = /submitted.{0,80}(facebook|group|post|approval)|da gui.{0,80}(bai|nhom|phe duyet)|cam on ban da dang bai/;
  const isCompactLiveSurface = (element: Element, text: string) => {
    if (text.length < 8 || text.length > 1_800) return false;

    const role = element.getAttribute('role') ?? '';
    const live = element.getAttribute('aria-live') ?? '';
    return role === 'alert'
      || role === 'status'
      || role === 'dialog'
      || (Boolean(live) && live !== 'off');
  };
  const readSubmissionMessage = () => {
    const surfaces = queryAll(
      document,
      '[role="alert"], [role="status"], [aria-live], [role="dialog"], [role="article"], article, [data-pagelet*="FeedUnit"], div[aria-posinset]',
    )
      .filter((element) => isVisible(element))
      .filter((element) => !isInsideCommentSurface(element));

    for (const surface of surfaces) {
      const text = elementLabel(surface);
      const hasContent = textMatchesSubmittedContent(text);
      const compactLiveSurface = isCompactLiveSurface(surface, text);
      if (!hasContent && !compactLiveSurface) continue;

      if (pendingSubmissionPattern.test(text)) {
        return 'Submitted to Facebook group: pending approval detected.';
      }

      if (submittedPattern.test(text)) {
        return 'Submitted to Facebook group.';
      }
    }

    return null;
  };
  const readPendingSignalScope = () => {
    const surfaces = queryAll(
      document,
      '[role="alert"], [role="status"], [aria-live], [role="dialog"], [role="article"], article, [data-pagelet*="FeedUnit"], div[aria-posinset]',
    )
      .filter((element) => isVisible(element))
      .filter((element) => !isInsideCommentSurface(element));

    for (const surface of surfaces) {
      const text = elementLabel(surface);
      if (!pendingSubmissionPattern.test(text) && !submittedPattern.test(text)) continue;

      const hasContent = textMatchesSubmittedContent(text);
      if (hasContent && (surface.getAttribute('role') === 'article' || surface.matches('article, [data-pagelet*="FeedUnit"], div[aria-posinset]'))) {
        return 'card';
      }

      if (surface.getAttribute('role') === 'dialog') return hasContent ? 'dialog-with-content' : 'dialog';
      if (isCompactLiveSurface(surface, text)) return hasContent ? 'toast-with-content' : 'toast';
    }

    const bodyText = normalize(document.body?.innerText ?? '');
    return pendingSubmissionPattern.test(bodyText) || submittedPattern.test(bodyText) ? 'body-only' : 'none';
  };
  const buildSubmitDiagnosticMessage = (
    code: string,
    summary: string,
    state = readPostSurfaceState(),
    extra: Record<string, string | number | boolean | null | undefined> = {},
  ) => {
    const clickElement = readElementAtClickPoint();
    const blockingCue = extra.blockingCue ?? readBlockingCue() ?? 'none';
    const bodyErrorCue = extra.bodyErrorCue ?? readBodyErrorCue() ?? 'none';
    const pendingSignalScope = readPendingSignalScope();
    const clickPoint = diagnosticInput.clickPoint ?? null;
    const contentHash = hashText(normalize(content));
    const currentUrl = shorten(window.location.href, 180);
    const fields = [
      `targetGroupId=${getTargetGroupId()}`,
      `tabActive=${diagnosticInput.tabActive ?? 'unknown'}`,
      `activationMode=${diagnosticInput.activationMode ?? 'cdp-mouse'}`,
      `visibility=${document.visibilityState}`,
      `focused=${document.hasFocus()}`,
      `click=${formatPoint(clickPoint)}`,
      `clickLabel="${shorten(clickPoint?.label, 80)}"`,
      `clickRect=${formatRect(clickPoint?.rect)}`,
      `elementAtClick="${clickElement.label}"`,
      `elementAtClickTag=${clickElement.tag}`,
      `elementAtClickRole=${clickElement.role}`,
      `elementAtClickMatchesSubmit=${clickElement.matchesSubmit}`,
      `after={contentInEditor:${state.contentInEditor},editorTextLength:${state.editorTextLength},submitButtonFound:${state.submitButtonFound},submitButtonDisabled:${state.submitButtonDisabled},submitButtonLabel:"${shorten(state.submitButtonLabel, 80)}",submitButtonRect:${formatRect(state.submitButtonRect)}}`,
      `pendingSignalScope=${pendingSignalScope}`,
      `blockingCue="${shorten(String(blockingCue), 220)}"`,
      `bodyErrorCue="${shorten(String(bodyErrorCue), 220)}"`,
      `contentHash=${contentHash}`,
      `currentUrl="${currentUrl}"`,
    ];

    return `${code}: ${summary} ${fields.join('; ')}`;
  };
  const startedAt = Date.now();
  const deadline = Date.now() + 45_000;
  let observedPostContentAfterClick = false;
  let observedSubmitButtonAfterClick = false;
  let observedPostSurfaceChangeAfterClick = false;
  let lastPostSurfaceState: ReturnType<typeof readPostSurfaceState> | null = null;
 
  while (Date.now() < deadline) {
    const currentPostUrl = parsePostUrlFromLocation(window.location.href);
    if (currentPostUrl && isExpectedSubmitPost(currentPostUrl)) {
      return {
        status: 'SUCCESS',
        message: currentPostUrl.pathType === 'posts'
          ? 'Facebook submission URL was detected after click.'
          : 'Facebook submission pending URL was detected after click.',
        externalPostId: currentPostUrl.postId,
        externalPostUrl: currentPostUrl.url,
        postClickEvidence: true,
      };
    }

    const errorMessage = readSubmissionError();
    if (errorMessage) {
      return {
        status: 'FAILED',
        message: errorMessage,
      };
    }

    const submissionMessage = readSubmissionMessage();
    if (submissionMessage) {
      return {
        status: 'SUCCESS',
        message: submissionMessage,
        postClickEvidence: true,
      };
    }

    const postSurfaceState = readPostSurfaceState();
    lastPostSurfaceState = postSurfaceState;
    observedPostContentAfterClick = observedPostContentAfterClick || postSurfaceState.contentInEditor;
    observedSubmitButtonAfterClick = observedSubmitButtonAfterClick || postSurfaceState.submitButtonFound;
    observedPostSurfaceChangeAfterClick = observedPostSurfaceChangeAfterClick
      || (
        observedPostContentAfterClick
        && (
          !postSurfaceState.contentInEditor
          || !postSurfaceState.submitButtonFound
          || postSurfaceState.submitButtonDisabled
        )
      );
    const elapsedMs = Date.now() - startedAt;
    const blockingCue = readBlockingCue();

    if (blockingCue && elapsedMs > 1_200) {
      return {
        status: 'FAILED',
        message: buildSubmitDiagnosticMessage(
          'FB_SUBMIT_BLOCKED_BY_DIALOG',
          'Facebook submit appears blocked by a visible dialog or security cue.',
          postSurfaceState,
          { blockingCue },
        ),
      };
    }

    if (!postSurfaceState.hasPostSurface && elapsedMs > 1_200) {
      return {
        status: 'FAILED',
        message: buildSubmitDiagnosticMessage(
          'FB_SUBMIT_COMPOSER_CLOSED_UNVERIFIED',
          'Facebook composer closed after submit; post URL still needs recovery.',
          postSurfaceState,
        ),
        postClickEvidence: true,
      };
    }

    if (
      elapsedMs > 15_000
      && postSurfaceState.contentInEditor
      && postSurfaceState.submitButtonFound
      && !postSurfaceState.submitButtonDisabled
      && (observedPostContentAfterClick || observedSubmitButtonAfterClick)
    ) {
      const clickElement = readElementAtClickPoint();
      const code = clickElement.matchesSubmit
        ? 'FB_SUBMIT_BUTTON_STILL_READY'
        : 'FB_SUBMIT_CLICK_POINT_STALE';
      const summary = clickElement.matchesSubmit
        ? 'Facebook submit button remained enabled after click; submit was not triggered.'
        : 'Facebook click point no longer resolves to the submit button after click; submit was not triggered.';
      return {
        status: 'FAILED',
        message: buildSubmitDiagnosticMessage(code, summary, postSurfaceState),
      };
    }

    await sleepInPage(500);
  }

  if (observedPostSurfaceChangeAfterClick) {
    return {
      status: 'FAILED',
      message: buildSubmitDiagnosticMessage(
        'FB_SUBMIT_SURFACE_CHANGED_UNVERIFIED',
        'Facebook post surface changed after submit; post URL still needs recovery.',
      ),
      postClickEvidence: true,
    };
  }

  return {
    status: 'FAILED',
    message: buildSubmitDiagnosticMessage(
      'FB_SUBMIT_TIMEOUT',
      'Facebook post submission did not complete after clicking the submit button.',
    ),
    postClickEvidence: !lastPostSurfaceState?.hasPostSurface
      || !lastPostSurfaceState?.submitButtonFound
      || !lastPostSurfaceState?.contentInEditor
      || observedPostSurfaceChangeAfterClick
      || observedPostContentAfterClick,
  };
}
