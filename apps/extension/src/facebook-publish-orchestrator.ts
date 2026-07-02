import { reportFacebookPublishResult } from './api-client';
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
    await reportFacebookPublishResult(accessToken, payload);
    results.push(payload);

    if (index < plan.targets.length - 1) {
      const delayMs = randomDelay(plan.delay.minMs, plan.delay.maxMs);
      callbacks.onProgress?.({
        status: 'DELAYING',
        currentIndex: index + 1,
        total,
        target,
        message: `Waiting ${Math.round(delayMs / 1000)}s before the next Facebook group.`,
        results,
      });
      await sleep(delayMs);
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

export async function ensureFacebookSession(callbacks: FacebookSessionCallbacks = {}) {
  callbacks.onStatus?.({
    status: 'CHECKING_LOGIN',
    message: 'Checking Facebook login in this browser.',
  });

  const tab = await openTab('https://www.facebook.com/', true);
  await waitForTabComplete(tab.id);
  let status = await runScript<[], FacebookLoginCheckResult>(tab.id, checkFacebookLoginInPage, []);
  if (status.ready) {
    callbacks.onStatus?.({
      status: 'READY',
      message: status.message,
      url: status.url,
    });
    return status;
  }

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
      callbacks.onStatus?.({
        status: 'READY',
        message: status.message,
        url: status.url,
      });
      return status;
    }
  }

  throw new Error(status.message || 'Facebook login timed out.');
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

  const tab = await openTab(target.targetUrl, true);
  await waitForTabComplete(tab.id);
  await sleep(randomDelay(2_500, 6_000));
  return runScript<[string], FacebookPagePublishResult>(tab.id, publishOnFacebookPage, [content]);
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

    await reportFacebookPublishResult(accessToken, payload);
    results.push(payload);
  }
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

async function publishOnFacebookPage(content: string): Promise<FacebookPagePublishResult> {
  const sleepInPage = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const normalize = (value: string) => value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd')
    .replace(/\u0110/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
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
  ].join(' '));
  const clickElement = (element: Element) => {
    const clickable = element.closest('button, [role="button"], [tabindex]') ?? element;
    (clickable as HTMLElement).click();
  };
  const findClickable = (patterns: RegExp[]) => {
    const elements = Array.from(document.querySelectorAll('button, [role="button"], [tabindex], span, div'));
    return elements.find((element) => {
      if (!isVisible(element)) return false;
      const label = elementLabel(element);
      if (!label || label.length > 160) return false;
      return patterns.some((pattern) => pattern.test(label));
    });
  };
  const waitForElement = async (
    selector: string,
    timeoutMs: number,
  ): Promise<HTMLElement | null> => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const candidates = Array.from(document.querySelectorAll(selector))
        .filter(isVisible) as HTMLElement[];
      const candidate = candidates[candidates.length - 1];
      if (candidate) return candidate;
      await sleepInPage(400);
    }
    return null;
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

  const composer = findClickable([
    /write something/,
    /create a public post/,
    /what.?s on your mind/,
    /viet gi/,
    /tao bai viet/,
  ]);
  if (!composer) {
    return {
      status: 'FAILED',
      message: 'Could not find Facebook group post composer.',
    };
  }

  clickElement(composer);
  await sleepInPage(2_000 + Math.random() * 3_000);

  const editor = await waitForElement('[contenteditable="true"][role="textbox"], [contenteditable="true"]', 10_000);
  if (!editor) {
    return {
      status: 'FAILED',
      message: 'Could not find Facebook post editor.',
    };
  }

  editor.focus();
  document.execCommand('selectAll', false);
  document.execCommand('insertText', false, content);
  editor.dispatchEvent(new InputEvent('input', {
    bubbles: true,
    cancelable: true,
    inputType: 'insertText',
    data: content,
  }));
  await sleepInPage(2_500 + Math.random() * 3_500);

  const submitButton = findClickable([
    /^post$/,
    /^dang$/,
  ]);
  if (!submitButton) {
    return {
      status: 'FAILED',
      message: 'Could not find enabled Facebook Post button.',
    };
  }

  clickElement(submitButton);
  await sleepInPage(10_000);

  const afterSubmitText = normalize(document.body?.innerText ?? '');
  if (/something went wrong|try again|couldn.?t post|khong the dang|thu lai/.test(afterSubmitText)) {
    return {
      status: 'FAILED',
      message: 'Facebook returned a post submission error.',
    };
  }

  const pendingMatch = afterSubmitText.match(/pending|submitted|waiting for approval|cho duyet|da gui/);
  return {
    status: 'SUCCESS',
    message: pendingMatch
      ? `Submitted to Facebook group: ${pendingMatch[0]}`
      : 'Submitted to Facebook group.',
  };
}
