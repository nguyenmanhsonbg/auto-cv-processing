import { ApiClientError, reportFacebookPublishResult } from './api-client';
import { getAccessToken } from './auth-store';
import {
  buildFacebookGroupPostUrl,
  parseFacebookGroupPostUrl,
  type FacebookGroupPostPathType,
} from './facebook-post-url';
import type {
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
}

export type FacebookSessionStatus = 'CHECKING_LOGIN' | 'WAITING_LOGIN' | 'READY';

export interface FacebookSessionEvent {
  status: FacebookSessionStatus;
  message: string;
  url?: string;
}

interface FacebookSessionCallbacks {
  onStatus?: (event: FacebookSessionEvent) => void;
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
  timestampClickPoint?: FacebookSubmitButtonPoint | null;
}

interface FacebookSubmitButtonPoint {
  clientX: number;
  clientY: number;
  label: string;
}

interface FacebookPreparedPostResult {
  status: 'READY_TO_SUBMIT' | 'FAILED';
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

interface FacebookPendingPostUrlRecoveryInput {
  title?: string | null;
  contentPreview?: string | null;
  targetUrl?: string | null;
  targetExternalId?: string | null;
}

interface FacebookSubmittedPostRecoveryResult {
  probe: FacebookPostReviewStatusProbeResult | null;
  postUrl: NonNullable<ReturnType<typeof parseFacebookGroupPostUrl>> | null;
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
    callbacks.onProgress?.({
      status: 'POSTING',
      currentIndex: index + 1,
      total,
      target,
      message: `Posting to ${target.targetName}.`,
      results,
    });

    const result = await publishTarget(target, plan.content);
    const externalPost = parseFacebookGroupPostUrl(result.externalPostUrl);
    const payload: FacebookPublishResultPayload = {
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

  callbacks.onProgress?.({
    status: 'SUCCESS',
    currentIndex: total,
    total,
    message: 'Facebook publishing completed.',
    results,
  });

  return results;
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
    await ensureFacebookSession();
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

    if (recoveryResult.timestampClickPoint) {
      await clickTabCoordinatePoint(tab.id, recoveryResult.timestampClickPoint).catch(() => undefined);
      const clickedPostUrl = await waitForExpectedFacebookPostUrlInTab(
        tab.id,
        history.targetUrl,
        history.targetExternalId,
        8_000,
      );
      if (clickedPostUrl) {
        return {
          facebookReviewStatus: clickedPostUrl.pathType === 'posts' ? 'POSTED' : 'PENDING_REVIEW',
          message: 'Recovered Facebook group post URL by opening the pending post timestamp.',
          externalPostId: clickedPostUrl.postId,
          externalPostUrl: clickedPostUrl.url,
          checkedAt,
        };
      }

      await sleep(randomDelay(700, 1_200));
      recoveryResult = await recoverInCurrentPage();
      const clickedUrl = parseFacebookGroupPostUrl(recoveryResult.externalPostUrl);
      if (clickedUrl) {
        return {
          facebookReviewStatus: clickedUrl.pathType === 'posts' ? 'POSTED' : 'PENDING_REVIEW',
          message: recoveryResult.message,
          externalPostId: clickedUrl.postId,
          externalPostUrl: clickedUrl.url,
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
    ).catch((error): FacebookPagePublishResult => ({
      status: 'FAILED',
      message: toAutomationErrorMessage(error),
    }));

    latestFailure = result;
    if (
      result.status !== 'FAILED'
      || result.submitClickDispatched
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
): Promise<FacebookPagePublishResult> {
  const tab = await openTab(targetUrl, false);
  try {
    let latestFailure: FacebookPreparedPostResult | null = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await waitForTabComplete(tab.id);
      await sleep(randomDelay(attempt === 0 ? 2_500 : 4_000, attempt === 0 ? 6_000 : 8_000));
      const preparedPost = await runScript<[string], FacebookPreparedPostResult>(
        tab.id,
        prepareFacebookPostInPage,
        [content],
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

async function waitForExpectedFacebookPostUrlInTab(
  tabId: number,
  targetUrl: string | null | undefined,
  targetExternalId: string | null | undefined,
  timeoutMs: number,
) {
  const expectedGroupIds = getExpectedFacebookGroupIds(targetUrl, targetExternalId);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const tab = await chrome.tabs?.get(tabId).catch(() => null);
    const postUrl = parseFacebookGroupPostUrl(tab?.url);
    if (isExpectedFacebookGroupPostUrl(postUrl, expectedGroupIds)) {
      return postUrl;
    }

    await sleep(250);
  }

  return null;
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

  try {
    await clickTabPoint(tabId, submitButton);
  } catch (error) {
    return {
      status: 'FAILED',
      message: error instanceof Error ? error.message : 'Facebook submit click failed.',
    };
  }

  try {
    const submissionResult = await runScript<[string], FacebookPagePublishResult>(
      tabId,
      waitForFacebookSubmissionInPage,
      [content],
    );
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
  );
  const currentPageResult = buildFacebookPublishResultFromRecovery(result, currentPageRecovery);
  if (currentPageResult) return currentPageResult;

  const pendingManagerRecovery = await recoverFacebookSubmittedPostUrlFromPendingManager(
    tabId,
    content,
    targetUrl,
    targetExternalId,
  );
  const pendingManagerResult = buildFacebookPublishResultFromRecovery(result, pendingManagerRecovery);
  if (pendingManagerResult) return pendingManagerResult;

  if (result.status === 'SUCCESS') {
    return {
      ...result,
      status: 'FAILED',
      message: `${result.message} However, the submitted post could not be verified in the Facebook group or pending manager.`,
      externalPostId: null,
      externalPostUrl: null,
    };
  }

  return result;
}

async function recoverFacebookSubmittedPostUrlInCurrentPage(
  tabId: number,
  content: string,
  targetUrl: string | null | undefined,
  targetExternalId: string | null | undefined,
): Promise<FacebookSubmittedPostRecoveryResult> {
  const recoverInCurrentPage = async () => runScript<[FacebookPendingPostUrlRecoveryInput], FacebookPostReviewStatusProbeResult>(
    tabId,
    recoverFacebookPendingPostUrlInPage,
    [{
      contentPreview: content,
      targetUrl: targetUrl ?? null,
      targetExternalId: targetExternalId ?? null,
    }],
  ).catch(() => null);

  let probe = await recoverInCurrentPage();
  let postUrl = parseFacebookGroupPostUrl(probe?.externalPostUrl);
  if (postUrl) return { probe, postUrl };

  if (probe?.timestampClickPoint) {
    await clickTabCoordinatePoint(tabId, probe.timestampClickPoint).catch(() => undefined);
    const clickedPostUrl = await waitForExpectedFacebookPostUrlInTab(
      tabId,
      targetUrl,
      targetExternalId,
      10_000,
    );
    if (clickedPostUrl) {
      return {
        probe: {
          ...probe,
          facebookReviewStatus: clickedPostUrl.pathType === 'posts' ? 'POSTED' : 'PENDING_REVIEW',
          message: 'Confirmed Facebook group post URL by opening the submitted post timestamp.',
          externalPostId: clickedPostUrl.postId,
          externalPostUrl: clickedPostUrl.url,
        },
        postUrl: clickedPostUrl,
      };
    }

    await sleep(randomDelay(700, 1_200));
    probe = await recoverInCurrentPage();
    postUrl = parseFacebookGroupPostUrl(probe?.externalPostUrl);
    if (postUrl) return { probe, postUrl };
  }

  return { probe, postUrl: null };
}

async function recoverFacebookSubmittedPostUrlFromPendingManager(
  tabId: number,
  content: string,
  targetUrl: string | null | undefined,
  targetExternalId: string | null | undefined,
): Promise<FacebookSubmittedPostRecoveryResult> {
  const pendingManagerUrl = buildFacebookPendingPostsManagerUrl(targetUrl, targetExternalId);
  if (!pendingManagerUrl) {
    return { probe: null, postUrl: null };
  }

  await chrome.tabs?.update(tabId, { url: pendingManagerUrl });
  await waitForTabComplete(tabId);
  await sleep(randomDelay(1_500, 3_000));

  return recoverFacebookSubmittedPostUrlInCurrentPage(tabId, content, targetUrl, targetExternalId);
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

  const probeMessage = recovery.probe?.message ?? '';
  const matchedSubmittedPost = recovery.probe
    && recovery.probe.facebookReviewStatus !== 'UNKNOWN'
    && /matched|recovered|current facebook url|pending post card|submitted post/i.test(probeMessage);
  if (!matchedSubmittedPost) return null;

  return {
    ...result,
    status: 'SUCCESS',
    message: `${probeMessage} Post URL could not be captured automatically.`,
    externalPostId: null,
    externalPostUrl: null,
    postClickEvidence: true,
  };
}

function isPostClickConfirmationFailure(message: string) {
  return /could not be confirmed after submit click|could not be observed after submit click|composer closed after submit|post surface changed after submit|post submission did not complete after clicking/i.test(message);
}

function shouldRetryBackgroundSubmitFailure(message: string) {
  return /target closed|target page|cannot access|not activated|post editor is not open before submit|post content is not present before submit|post button is not ready before submit|could not resolve facebook post button before submit/i.test(message);
}

async function runScript<Args extends unknown[], Result>(
  tabId: number,
  func: (...args: Args) => Result | Promise<Result>,
  args: Args,
) {
  const [result] = await chrome.scripting?.executeScript<Args, Result>({
    target: { tabId },
    func,
    args,
  }) ?? [];

  if (!result?.result) {
    throw new Error(chrome.runtime?.lastError?.message ?? 'Could not execute browser automation script.');
  }

  return result.result;
}

async function clickTabPoint(tabId: number, point: FacebookSubmitButtonPoint) {
  if (!chrome.debugger) {
    throw new Error('chrome.debugger API is unavailable for Facebook submit click.');
  }

  const target = { tabId };
  await debuggerAttach(target, '1.3');
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
    const clickPoint = probedPoint?.found && probedPoint.submitButton
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

async function prepareFacebookPostInPage(content: string): Promise<FacebookPreparedPostResult> {
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
  const insertContent = async (editor: HTMLElement) => {
    const safetyMessage = getPostEditorSafetyMessage(editor);
    if (safetyMessage) return false;

    const expectedSample = normalize(content).slice(0, 24);
    const currentText = () => normalize(editor.innerText || editor.textContent || '');

    editor.focus();
    await sleepInPage(300);
    if (document.activeElement !== editor && !editor.contains(document.activeElement)) return false;
    if (getPostEditorSafetyMessage(editor)) return false;

    document.execCommand('selectAll', false);
    document.execCommand('insertText', false, content);
    editor.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data: content,
    }));
    await sleepInPage(500);

    if (!expectedSample || currentText().includes(expectedSample)) return true;

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
      // Facebook's React editor usually accepts execCommand; this is a fallback for blocked paste events.
    }

    if (currentText().includes(expectedSample)) return true;

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

  const submitButton = await waitForPostButton(surface, 12_000);
  if (!submitButton) {
    return {
      status: 'FAILED',
      message: 'Could not find enabled Facebook Post button.',
    };
  }

  const clickableButton = getClickableElement(submitButton);
  clickableButton.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'center' });
  await sleepInPage(150);
  const clickPoint = resolveClickPoint(submitButton);

  return {
    status: 'READY_TO_SUBMIT',
    message: 'Facebook post is ready to submit.',
    submitButton: {
      clientX: clickPoint.clientX,
      clientY: clickPoint.clientY,
      label: elementLabel(submitButton),
    },
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
      return {
        found: true,
        submitButton: {
          clientX: clickPoint.clientX,
          clientY: clickPoint.clientY,
          label: elementLabel(button),
        },
      };
    }
  }

  return { found: false };
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

    const match = parsedUrl.pathname.match(/^\/groups\/([^/]+)\/(posts|pending_posts)\/(\d+)\/?$/i);
    if (!match) return null;

    const groupId = decodeURIComponent(match[1]).trim();
    const pathType = match[2].toLowerCase() as FacebookGroupPostPathType;
    const postId = match[3];
    const suffix = pathType === 'posts' ? '/' : '';
    return {
      groupId,
      pathType,
      postId,
      url: `https://www.facebook.com/groups/${encodeURIComponent(groupId)}/${pathType}/${postId}${suffix}`,
    };
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
    /pending|waiting for approval|cho duyet|cho phe duyet|dang cho|quan tri vien phe duyet|admin approval/.test(text)
  );
  const makeSearchSamples = () => {
    const values = [input.title, input.contentPreview]
      .map((value) => normalize(value ?? ''))
      .filter((value) => value.length >= 8);

    return [...new Set(values.flatMap((value) => {
      const firstLine = value.split(/\n+/)[0]?.trim() ?? '';
      const words = value.split(' ').filter((word) => word.length > 2);
      return [
        value.slice(0, 180),
        firstLine.slice(0, 140),
        words.slice(0, 16).join(' '),
      ].filter((sample) => sample.length >= 8);
    }))];
  };
  const samples = makeSearchSamples();
  const getContentScore = (element: Element) => {
    if (samples.length === 0) return 0;
    const text = textOf(element);
    if (text.length < 8) return 0;

    return samples.reduce((score, sample) => {
      if (text.includes(sample)) return score + Math.min(240, sample.length * 3);
      if (sample.length >= 40 && text.includes(sample.slice(0, 40))) return score + 80;
      if (sample.length >= 24 && text.includes(sample.slice(0, 24))) return score + 40;
      return score;
    }, 0);
  };
  const getClickableElement = (element: Element) => (
    element.closest('a[href], [role="link"], [role="button"], button, [tabindex]') ?? element
  );
  const getCardRoot = (element: Element) => {
    let current: Element | null = element;
    let best: Element = element;
    let depth = 0;

    while (current && current !== document.body && depth < 10) {
      const rect = current.getBoundingClientRect();
      const text = normalize(current.textContent ?? '');
      const looksLikeCard = rect.width >= 260
        && rect.height >= 70
        && text.length >= 40
        && text.length <= 6_000;
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
      .filter((element) => getContentScore(element) > 0);
    textElements.forEach((element) => cards.add(getCardRoot(element)));

    const actionElements = Array.from(document.querySelectorAll('button, [role="button"], a, span, div'))
      .filter((element) => isVisible(element))
      .filter((element) => /^(chinh sua|edit|xoa|delete)$/.test(textOf(element)));
    actionElements.forEach((element) => cards.add(getCardRoot(element)));

    return Array.from(cards).filter(isVisible);
  };
  const findBestCard = () => {
    const scored = collectCardCandidates()
      .map((card) => {
        const text = textOf(card);
        const rect = card.getBoundingClientRect();
        const contentScore = getContentScore(card);
        const pendingScore = hasPendingCue(text) ? 100 : 0;
        const actionScore = /chinh sua|edit|xoa|delete/.test(text) ? 25 : 0;
        const viewportScore = rect.top >= -80 && rect.top <= window.innerHeight ? 30 : 0;
        const sizePenalty = Math.max(0, (text.length - 2_400) / 120);
        return {
          card,
          score: contentScore + pendingScore + actionScore + viewportScore - sizePenalty,
        };
      })
      .filter((item) => item.score >= 45)
      .sort((left, right) => right.score - left.score);

    return scored[0]?.card ?? null;
  };
  const findPostUrlInCard = (card: Element) => {
    const links = Array.from(card.querySelectorAll('a[href]'));
    for (const link of links) {
      const postUrl = parsePostUrl(link.getAttribute('href'));
      if (isExpectedPostUrl(postUrl)) return postUrl;
    }

    return null;
  };
  const findContentElement = (card: Element) => {
    const candidates = Array.from(card.querySelectorAll('div, span, p'))
      .filter(isVisible)
      .map((element) => ({
        element,
        score: getContentScore(element),
        textLength: textOf(element).length,
      }))
      .filter((item) => item.score > 0 && item.textLength <= 2_500)
      .sort((left, right) => right.score - left.score || left.textLength - right.textLength);

    return candidates[0]?.element ?? null;
  };
  const isTimestampLike = (element: Element) => {
    const value = textOf(element);
    if (!value || value.length > 90) return false;

    return /(^|\s)(vua xong|just now|hom qua|yesterday)(\s|$)|^\d+\s*(s|sec|secs|second|seconds|giay|m|min|mins|minute|minutes|phut|h|hr|hrs|hour|hours|gio|d|day|days|ngay|w|week|weeks|tuan|mo|month|months|thang|y|yr|year|years|nam)(\s|$)|^\d{1,2}\s*thang\s*\d{1,2}|^\d{1,2}\/\d{1,2}/.test(value);
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
  const hasActionMenuText = (value: string) => (
    value.includes('...')
      || /(^|\s)(more|more options|actions?|options?|menu|see more|xem them|khac|tuy chon|chinh sua|edit|xoa|delete|moi nhat truoc|newest|tim hieu them|learn more|quan ly bai viet|manage posts|binh luan|comment|thich|like|gui|send)(\s|$)/.test(value)
  );
  const isBadTimestampCandidate = (element: Element, card: Element) => {
    const value = textOf(element);
    if (hasActionMenuText(value) || hasActionMenuText(directTextOf(element))) return true;

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
  const isSemanticLink = (element: Element, clickable: Element) => (
    element instanceof HTMLAnchorElement
      || clickable instanceof HTMLAnchorElement
      || element.getAttribute('role') === 'link'
      || clickable.getAttribute('role') === 'link'
  );
  const isInsideCard = (element: Element, card: Element) => card === element || card.contains(element);
  const buildTimestampPoint = (rect: DOMRect): FacebookSubmitButtonPoint => ({
    clientX: Math.round(rect.left + rect.width / 2),
    clientY: Math.round(rect.top + rect.height / 2),
    label: 'Facebook pending post timestamp',
  });
  const isAcceptedTimestampCandidate = (input: {
    hrefPostUrl: ReturnType<typeof parsePostUrl>;
    looksTimeLike: boolean;
    closeAboveContent: boolean;
    compact: boolean;
    semanticLink: boolean;
    score: number;
  }) => (
    isExpectedPostUrl(input.hrefPostUrl)
      || (
        input.score >= 250
          && input.compact
          && (input.looksTimeLike || input.closeAboveContent)
          && (input.semanticLink || input.looksTimeLike)
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
  const getTimestampCandidates = (card: Element) => {
    const contentElement = findContentElement(card);
    const contentRect = contentElement?.getBoundingClientRect() ?? null;
    const cardRect = card.getBoundingClientRect();
    const domCandidates = Array.from(card.querySelectorAll('a[href], [role="link"], [role="button"], button, span, div'));
    const visualCandidates = contentRect
      ? [
        [contentRect.left + Math.min(92, Math.max(36, contentRect.width * 0.16)), contentRect.top - 18],
        [contentRect.left + Math.min(132, Math.max(56, contentRect.width * 0.22)), contentRect.top - 24],
        [contentRect.left + Math.min(180, Math.max(76, contentRect.width * 0.28)), contentRect.top - 16],
      ].flatMap(([x, y]) => document.elementsFromPoint(x, y))
        .flatMap((element) => {
          const clickable = getClickableElement(element);
          return clickable === element ? [element] : [element, clickable];
        })
      : [];
    const rawCandidates = [...new Set([...domCandidates, ...visualCandidates])]
      .filter(isVisible)
      .filter((element) => isInsideCard(element, card))
      .filter((element) => !isBadTimestampCandidate(element, card));

    return rawCandidates
      .map((element) => {
        const clickable = getClickableElement(element);
        if (!isInsideCard(clickable, card) || isBadTimestampCandidate(clickable, card)) return null;

        const rect = (clickable === element ? element : clickable).getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return null;

        const href = getSemanticHref(element);
        const hrefPostUrl = parsePostUrl(href);
        const looksTimeLike = isTimestampLike(element) || isTimestampLike(clickable);
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
        const rectScore = getRectScore(rect, cardRect, contentRect);
        if (
          rectScore < 0
          || (!isExpectedPostUrl(hrefPostUrl) && !looksTimeLike && !(closeAboveContent && compact))
        ) {
          return null;
        }

        const score = (isExpectedPostUrl(hrefPostUrl) ? 500 : 0)
          + (looksTimeLike ? 250 : 0)
          + (closeAboveContent ? 160 : 0)
          + (compact ? 80 : 0)
          + (semanticLink ? 80 : 0)
          + rectScore
          - Math.max(0, rect.width - 160) / 4;
        if (!isAcceptedTimestampCandidate({
          hrefPostUrl,
          looksTimeLike,
          closeAboveContent,
          compact,
          semanticLink,
          score,
        })) {
          return null;
        }

        return {
          hrefPostUrl,
          point: buildTimestampPoint(rect),
          score,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort((left, right) => right.score - left.score);
  };
  const resolveTimestampInCard = (card: Element) => {
    const candidates = getTimestampCandidates(card);
    for (const candidate of candidates.slice(0, 5)) {
      if (isExpectedPostUrl(candidate.hrefPostUrl)) {
        return {
          postUrl: candidate.hrefPostUrl,
          timestampClickPoint: null,
        };
      }
    }

    return {
      postUrl: null,
      timestampClickPoint: candidates[0]?.point ?? null,
    };
  };

  const currentPostUrl = parsePostUrl(window.location.href);
  const expectedCurrentPostUrl = isExpectedPostUrl(currentPostUrl) ? currentPostUrl : null;
  if (expectedCurrentPostUrl) {
    return {
      facebookReviewStatus: expectedCurrentPostUrl.pathType === 'posts' ? 'POSTED' : 'PENDING_REVIEW',
      message: 'Current Facebook URL already contains the group post id.',
      externalPostId: expectedCurrentPostUrl.postId,
      externalPostUrl: expectedCurrentPostUrl.url,
    };
  }

  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const bodyText = normalize(document.body?.innerText ?? '');
    const matchedCard = findBestCard();
    if (matchedCard) {
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
      if (openedTimestamp.postUrl) {
        return {
          facebookReviewStatus: openedTimestamp.postUrl.pathType === 'posts' ? 'POSTED' : 'PENDING_REVIEW',
          message: 'Recovered Facebook group post URL by opening the matched pending post timestamp.',
          externalPostId: openedTimestamp.postUrl.postId,
          externalPostUrl: openedTimestamp.postUrl.url,
        };
      }

      return {
        facebookReviewStatus: 'PENDING_REVIEW',
        message: openedTimestamp.timestampClickPoint
          ? 'Matched pending post card; trusted timestamp click is required to capture the pending post URL.'
          : 'Matched pending post card but could not find a timestamp link or click point.',
        externalPostId: null,
        externalPostUrl: null,
        timestampClickPoint: openedTimestamp.timestampClickPoint,
      };
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
    facebookReviewStatus: 'UNKNOWN',
    message: 'Could not find a matching pending post in the group pending posts manager.',
    externalPostId: null,
    externalPostUrl: null,
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

    const match = parsedUrl.pathname.match(/^\/groups\/([^/]+)\/(posts|pending_posts)\/(\d+)\/?$/i);
    if (!match) return null;

    return {
      pathType: match[2].toLowerCase(),
      url: parsedUrl.href,
    };
  };
  const hasUnavailableCue = (text: string) => (
    /content isn't available|this content isn't available|noi dung nay khong hien co|khong tim thay noi dung|page isn't available|trang nay khong kha dung/.test(text)
  );
  const hasNoPendingReviewCue = (text: string) => (
    /chua co bai viet nao de xem xet|khong co bai viet nao dang cho xem xet|no posts to review|no pending posts|no posts pending review/.test(text)
  );
  const hasRejectedCue = (text: string) => (
    /rejected|declined|not approved|was removed|has been removed|tu choi|bi tu choi|khong duoc phe duyet|da bi go/.test(text)
  );
  const hasPendingCue = (text: string) => (
    /pending|waiting for approval|cho duyet|cho phe duyet|dang cho|quan tri vien phe duyet|admin approval/.test(text)
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
  const pageLooksLikeLoadedPost = () => {
    const articleText = Array.from(document.querySelectorAll('[role="article"], article, [data-pagelet*="FeedUnit"]'))
      .map((element) => normalize(element.textContent ?? ''))
      .find((text) => text.length > 80);
    return Boolean(articleText);
  };
  const containsSubmittedPost = () => {
    if (samples.length === 0) return false;

    const candidates = [
      bodyText(),
      ...Array.from(document.querySelectorAll('[role="article"], article, [data-pagelet*="FeedUnit"]'))
        .map((element) => normalize(element.textContent ?? '')),
    ];

    return candidates.some((candidate) => (
      candidate.length >= 40
      && samples.some((sample) => candidate.includes(sample) || sample.includes(candidate.slice(0, 80)))
    ));
  };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await sleepInPage(attempt === 0 ? 0 : 900);
    const text = bodyText();
    const currentPostUrl = parsePostUrl(window.location.href);

    if (input.expectedPathType === 'pending_posts' && hasNoPendingReviewCue(text)) {
      return {
        facebookReviewStatus: 'REJECTED',
        message: 'Facebook shows no pending post to review for this pending post URL.',
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

    if (hasUnavailableCue(text)) {
      return {
        facebookReviewStatus: 'PENDING_REVIEW',
        message: input.expectedPathType === 'posts'
          ? 'Approved post URL is not visible yet; pending URL will be checked next.'
          : 'Post is not visible yet or the content is unavailable to this account.',
        externalPostUrl: input.externalPostUrl ?? null,
      };
    }

    if (containsSubmittedPost() && (input.expectedPathType !== 'pending_posts' || currentPostUrl?.pathType === 'posts')) {
      return {
        facebookReviewStatus: 'POSTED',
        message: 'Post is now visible in the Facebook group.',
        externalPostUrl: window.location.href,
      };
    }

    if (
      input.externalPostUrl
      && pageLooksLikeLoadedPost()
      && !hasPendingCue(text)
      && input.expectedPathType !== 'pending_posts'
      && currentPostUrl?.pathType === 'posts'
    ) {
      return {
        facebookReviewStatus: 'POSTED',
        message: 'Facebook post URL loaded and the post appears visible.',
        externalPostUrl: window.location.href,
      };
    }

    if (hasPendingCue(text)) {
      return {
        facebookReviewStatus: 'PENDING_REVIEW',
        message: 'Facebook still indicates that this post is pending approval.',
        externalPostUrl: input.externalPostUrl ?? null,
      };
    }

    window.scrollBy({ top: Math.max(420, window.innerHeight * 0.7), behavior: 'auto' });
  }

  return {
    facebookReviewStatus: 'PENDING_REVIEW',
    message: 'Post is still pending or not detectable in the current Facebook page.',
    externalPostUrl: input.externalPostUrl ?? null,
  };
}

async function waitForFacebookSubmissionInPage(content: string): Promise<FacebookPagePublishResult> {
  const sleepInPage = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
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

    return {
      hasPostSurface: Boolean(editor || submitButton),
      contentInEditor: Boolean(editor && (!contentSample || editorText.includes(contentSample))),
      submitButtonFound: Boolean(submitButton),
      submitButtonDisabled: submitButton ? isDisabled(submitButton) : false,
    };
  };
  const readSubmissionError = () => {
    const text = normalize(document.body?.innerText ?? '');
    return /something went wrong|try again|couldn.?t post|khong the dang|thu lai/.test(text)
      ? 'Facebook returned a post submission error.'
      : null;
  };
  const readSubmissionMessage = () => {
    const text = normalize(document.body?.innerText ?? '');
    if (
      /pending approval|waiting for approval|dang cho.{0,120}phe duyet|cho quan tri vien phe duyet|bai viet.{0,120}cho.{0,120}phe duyet|bai viet.{0,120}dang cho/.test(text)
    ) {
      return 'Submitted to Facebook group: pending approval detected.';
    }
    if (/submitted.{0,80}(facebook|group|post|approval)|da gui.{0,80}(bai|nhom|phe duyet)|cam on ban da dang bai/.test(text)) {
      return 'Submitted to Facebook group.';
    }

    return null;
  };
  const startedAt = Date.now();
  const deadline = Date.now() + 45_000;
  let observedPostContentAfterClick = false;
  let observedSubmitButtonAfterClick = false;
  let observedPostSurfaceChangeAfterClick = false;

  while (Date.now() < deadline) {
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

    if (!postSurfaceState.hasPostSurface && elapsedMs > 1_200) {
      return {
        status: 'FAILED',
        message: 'Facebook composer closed after submit; post URL still needs recovery.',
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
      return {
        status: 'FAILED',
        message: 'Facebook submit button remained available after click; submit was not triggered.',
      };
    }

    await sleepInPage(500);
  }

  if (observedPostSurfaceChangeAfterClick) {
    return {
      status: 'FAILED',
      message: 'Facebook post surface changed after submit; post URL still needs recovery.',
      postClickEvidence: true,
    };
  }

  return {
    status: 'FAILED',
    message: 'Facebook post submission did not complete after clicking Dang.',
  };
}
