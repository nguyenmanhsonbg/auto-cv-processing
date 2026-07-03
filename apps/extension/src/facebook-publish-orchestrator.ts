import { ApiClientError, reportFacebookPublishResult } from './api-client';
import { getAccessToken } from './auth-store';
import type {
  FacebookPublishPlan,
  FacebookPublishProgress,
  FacebookPublishResultPayload,
  FacebookPublishTarget,
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

interface FacebookPagePublishResult {
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  message: string;
  externalPostId?: string | null;
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
    const payload: FacebookPublishResultPayload = {
      jobPostingId: plan.jobPostingId,
      targetId: target.targetId ?? null,
      targetType: target.targetType,
      targetName: target.targetName,
      targetUrl: target.targetUrl ?? null,
      content: plan.content,
      status: result.status,
      message: result.message,
      externalPostId: result.externalPostId ?? null,
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
    const result = await publishTargetInFreshTab(target.targetUrl, content).catch((error) => ({
      status: 'FAILED' as const,
      message: toAutomationErrorMessage(error),
    }));

    latestFailure = result;
    if (result.status !== 'FAILED' || !isRecoverableTabAutomationFailure(result.message)) {
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
  content: string,
): Promise<FacebookPagePublishResult> {
  const tab = await openTab(targetUrl, false);
  let closeAfterPublish = true;
  try {
    let latestFailure: FacebookPreparedPostResult | null = null;
    let activatedForPrepareRetry = false;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await waitForTabComplete(tab.id);
      await sleep(randomDelay(attempt === 0 ? 2_500 : 4_000, attempt === 0 ? 6_000 : 8_000));
      const preparedPost = await runScript<[string], FacebookPreparedPostResult>(
        tab.id,
        prepareFacebookPostInPage,
        [content],
      );
      if (preparedPost.status === 'READY_TO_SUBMIT' && preparedPost.submitButton) {
        const submitResult = await submitPreparedPost(tab.id, preparedPost.submitButton, content);
        closeAfterPublish = submitResult.status === 'SUCCESS';
        return submitResult;
      }

      latestFailure = preparedPost;
      if (!shouldRetryPrepareFailure(preparedPost.message)) {
        break;
      }

      if (attempt === 0) {
        await reloadTab(tab.id);
        continue;
      }

      if (!activatedForPrepareRetry) {
        activatedForPrepareRetry = true;
        await activateTab(tab.id);
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
    if (closeAfterPublish) {
      await closeTabSafely(tab.id);
    }
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
      message,
      externalPostId: null,
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

async function submitPreparedPost(
  tabId: number,
  submitButton: FacebookSubmitButtonPoint,
  content: string,
): Promise<FacebookPagePublishResult> {
  const hiddenResult = await clickAndWaitForSubmission(tabId, submitButton, content);
  if (
    hiddenResult.status === 'SUCCESS'
    || isRecoverableTabAutomationFailure(hiddenResult.message)
    || !shouldRetryVisibleSubmitFailure(hiddenResult.message)
  ) {
    return hiddenResult;
  }

  try {
    await activateTab(tabId);
    await sleep(randomDelay(500, 1_200));
    return clickAndWaitForSubmission(tabId, submitButton, content);
  } catch (error) {
    return {
      status: 'FAILED',
      message: toAutomationErrorMessage(error),
    };
  }
}

async function clickAndWaitForSubmission(
  tabId: number,
  submitButton: FacebookSubmitButtonPoint,
  content: string,
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
    return await runScript<[string], FacebookPagePublishResult>(
      tabId,
      waitForFacebookSubmissionInPage,
      [content],
    );
  } catch (error) {
    return {
      status: 'FAILED',
      message: toAutomationErrorMessage(error),
    };
  }
}

function shouldRetryVisibleSubmitFailure(message: string) {
  return /did not complete|submit click|target closed|target page|cannot access|remained available|not triggered|not activated|resolve.*post button|ready before submit/i.test(message);
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
    while (current && depth < 6) {
      const label = elementLabel(current);
      if (matchesAny(label, POST_COMPOSER_PATTERNS)) return false;
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
  const findPostEditor = (root: Document | Element) => {
    const editors = queryAll(root, '[contenteditable="true"][role="textbox"], [contenteditable="true"]')
      .filter((element): element is HTMLElement => element instanceof HTMLElement)
      .filter((element) => isVisible(element))
      .filter((element) => !isInsideCommentSurface(element));

    return editors
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const label = elementLabel(element);
        const roleScore = element.getAttribute('role') === 'textbox' ? 40 : 0;
        const composerScore = matchesAny(label, POST_COMPOSER_PATTERNS) ? 60 : 0;
        const dialogScore = element.closest('[role="dialog"]') ? 30 : 0;
        const areaScore = Math.min(60, (rect.width * rect.height) / 2500);
        return {
          element,
          score: roleScore + composerScore + dialogScore + areaScore,
        };
      })
      .sort((left, right) => right.score - left.score)[0]?.element ?? null;
  };
  const findInlineComposerSurface = (editor: HTMLElement): Document | Element => {
    let current = editor.parentElement;
    let depth = 0;

    while (current && depth < 8) {
      const postButton = findPostSubmitButton(current);
      if (postButton) return current;

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
      if (editor) return findInlineComposerSurface(editor);

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
    const expectedSample = normalize(content).slice(0, 24);
    const currentText = () => normalize(editor.innerText || editor.textContent || '');

    editor.focus();
    await sleepInPage(300);
    document.execCommand('selectAll', false);
    document.execCommand('insertText', false, content);
    editor.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data: content,
    }));
    await sleepInPage(500);

    if (!expectedSample || currentText().includes(expectedSample)) return;

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

    if (currentText().includes(expectedSample)) return;

    editor.textContent = content;
    editor.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data: content,
    }));
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

  await insertContent(editor);
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
  const roots = dialogs.length > 0 ? dialogs : [document];
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
    while (current && depth < 6) {
      const label = elementLabel(current);
      if (matchesAny(label, POST_COMPOSER_PATTERNS) || isSubmitLabel(label)) return false;
      if (isCommentLabel(label)) return true;
      current = current.parentElement;
      depth += 1;
    }

    return false;
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
      return matchesAny(label, POST_COMPOSER_PATTERNS)
        || element.closest('[role="dialog"]')
        || normalize(element.innerText || element.textContent || '').length > 0;
    }) ?? null;
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
  const dialogs = queryAll(document, '[role="dialog"]')
    .filter((element) => isVisible(element));
  const roots = dialogs.length > 0 ? dialogs : [document];
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
    while (current && depth < 6) {
      const label = elementLabel(current);
      if (matchesAny(label, POST_COMPOSER_PATTERNS) || isSubmitLabel(label)) return false;
      if (isCommentLabel(label)) return true;
      current = current.parentElement;
      depth += 1;
    }

    return false;
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
      return matchesAny(label, POST_COMPOSER_PATTERNS)
        || element.closest('[role="dialog"]')
        || normalize(element.innerText || element.textContent || '').length > 0;
    }) ?? null;
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
  const readPostSurfaceState = () => {
    const dialogs = queryAll(document, '[role="dialog"]')
      .filter((element) => isVisible(element))
      .filter((element) => !isInsideCommentSurface(element));
    const roots = dialogs.length > 0 ? dialogs : [document];
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
      /pending|waiting for approval|dang cho.{0,120}phe duyet|cho quan tri vien phe duyet|bai viet.{0,120}cho.{0,120}phe duyet|cho duyet/.test(text)
    ) {
      return 'Submitted to Facebook group: pending approval detected.';
    }
    if (/submitted|da gui|cam on ban da dang bai/.test(text)) {
      return 'Submitted to Facebook group.';
    }

    return null;
  };
  const startedAt = Date.now();
  const deadline = Date.now() + 30_000;
  let observedPostContentAfterClick = false;
  let observedSubmitButtonAfterClick = false;

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
      };
    }

    const postSurfaceState = readPostSurfaceState();
    observedPostContentAfterClick = observedPostContentAfterClick || postSurfaceState.contentInEditor;
    observedSubmitButtonAfterClick = observedSubmitButtonAfterClick || postSurfaceState.submitButtonFound;
    const elapsedMs = Date.now() - startedAt;

    if (!postSurfaceState.hasPostSurface && elapsedMs > 1_200) {
      return {
        status: 'SUCCESS',
        message: 'Submitted to Facebook group.',
      };
    }

    if (
      elapsedMs > 5_000
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

  return {
    status: 'FAILED',
    message: 'Facebook post submission did not complete after clicking Dang.',
  };
}
