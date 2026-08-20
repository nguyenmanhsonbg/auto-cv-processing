import {
  attachChromeDebugger,
  decodeChromeDebuggerResponseBody,
  detachChromeDebugger,
  sendChromeDebuggerCommand,
} from '@/integrations/chrome-debugger-utils';
import {
  buildFacebookGroupPostUrl,
  parseFacebookGroupPostUrl,
} from '@/features/facebook/facebook-post-url';
import type { FacebookReviewStatus } from '@/types/types';

const FB_ORIGIN = 'https://www.facebook.com';
const DEBUGGER_VERSION = '1.3';
const NAVIGATION_TIMEOUT_MS = 30_000;
const MAX_BODY_LENGTH = 1_500_000;
// Facebook loads route definitions plus several data responses before the
// collection response. Keep a bounded capture, but allow the full sequence
// observed in the status HARs to be inspected.
const MAX_RESPONSES = 128;
const JSON_PREFIX = 'for (;;);';
const REVIEW_LOGIN_WAIT_TIMEOUT_MS = 10 * 60_000;
const REVIEW_LOGIN_POLL_INTERVAL_MS = 2_000;

const CAPTURE_TYPES = new Set(['Document', 'XHR', 'Fetch']);
const EMPTY_LIST_KEYS = new Set(['edges', 'nodes', 'items', 'stories', 'posts']);

type CollectionKind = 'pending' | 'published' | 'declined' | 'removed';
type EvidenceKind =
  | 'POST_ROUTE'
  | 'PENDING_COLLECTION'
  | 'PUBLISHED_COLLECTION'
  | 'DECLINED_COLLECTION'
  | 'REMOVED_COLLECTION'
  | 'REJECTED_POST_PAGE'
  | 'EMPTY_PENDING_COLLECTION'
  | 'INSUFFICIENT';

export interface FacebookReviewNetworkInput {
  initialStatus: FacebookReviewStatus;
  targetUrl?: string | null;
  targetExternalId?: string | null;
  externalPostUrl?: string | null;
  externalPostId?: string | null;
  title?: string | null;
  contentPreview?: string | null;
}

export interface FacebookReviewNetworkResult {
  facebookReviewStatus: FacebookReviewStatus;
  message: string;
  evidence: EvidenceKind;
  externalPostId?: string | null;
  externalPostUrl?: string | null;
}

export interface FacebookReviewNetworkCallbacks {
  onLoginRequired?: () => void;
}

interface FacebookReviewPageAuthState {
  ready: boolean;
  loginRequired: boolean;
  url: string;
}

interface CollectionConfig {
  suffixes: readonly string[];
  routeNames: readonly string[];
  sections: readonly string[];
  status: FacebookReviewStatus;
  evidence: EvidenceKind;
}

const COLLECTIONS: Record<CollectionKind, CollectionConfig> = {
  pending: {
    // Facebook currently serves both routes depending on the group/account
    // rollout. Probe both so a pending post is not treated as unresolved.
    suffixes: ['my_pending_content', 'pending_posts'],
    routeNames: [
      'comet.fbweb.GroupsCometViewerContentPendingRoute',
      'comet.fbweb.CometGroupPendingPostsRoute',
    ],
    sections: ['pending', 'pending_posts'],
    status: 'PENDING_REVIEW',
    evidence: 'PENDING_COLLECTION',
  },
  published: {
    suffixes: ['my_posted_content'],
    routeNames: ['comet.fbweb.GroupsCometViewerContentPublishedRoute'],
    sections: ['published'],
    status: 'POSTED',
    evidence: 'PUBLISHED_COLLECTION',
  },
  declined: {
    suffixes: ['my_declined_content'],
    routeNames: ['comet.fbweb.GroupsCometViewerContentDeclinedRoute'],
    sections: ['declined'],
    status: 'REJECTED',
    evidence: 'DECLINED_COLLECTION',
  },
  removed: {
    suffixes: ['my_removed_content'],
    routeNames: ['comet.fbweb.GroupsCometViewerContentRemovedRoute'],
    sections: ['removed'],
    status: 'DELETED',
    evidence: 'REMOVED_COLLECTION',
  },
};

interface RequestMeta {
  requestId: string;
  url: string;
  type: string;
  postData: string;
}

interface CapturedResponse {
  url: string;
  type: string;
  postData: string;
  body: string;
}

interface CaptureSession {
  reset: () => Promise<void>;
  waitForSettled: (
    minimumMs: number,
    maximumMs: number,
    quietMs: number,
  ) => Promise<void>;
  snapshot: () => Promise<CapturedResponse[]>;
  stop: () => Promise<void>;
}

interface RequestWillBeSentParams {
  requestId?: string;
  type?: string;
  request?: {
    url?: string;
    postData?: string;
  };
}

interface LoadingFinishedParams {
  requestId?: string;
}

interface RouteDefinition {
  routeUrl: string;
  error: boolean;
  canonicalRouteName: string | null;
  tracePolicy: string | null;
  groupId: string | null;
  section: string | null;
  storyId: string | null;
}

interface CollectionEvidence {
  matched: boolean;
  routeLoaded: boolean;
  dataObserved: boolean;
  explicitlyEmpty: boolean;
  postId: string | null;
  postUrl: string | null;
}

interface HistorySamples {
  title: string | null;
  content: string | null;
}

export async function probeFacebookReviewStatusByNetwork(
  input: FacebookReviewNetworkInput,
  callbacks: FacebookReviewNetworkCallbacks = {},
): Promise<FacebookReviewNetworkResult> {
  const parsedPost = parseFacebookGroupPostUrl(input.externalPostUrl);
  const groupId = parsedPost?.groupId
    ?? readGroupId(input.targetUrl)
    ?? normalizeId(input.targetExternalId);
  const postId = parsedPost?.postId ?? normalizeId(input.externalPostId);

  if (!groupId) {
    return insufficient(input, 'Không xác định được Facebook group id để kiểm tra trạng thái.');
  }

  const tab = await chrome.tabs?.create({ url: 'about:blank', active: false });
  if (!tab?.id) {
    return insufficient(input, 'Không tạo được hidden tab để kiểm tra trạng thái Facebook.');
  }

  let capture: CaptureSession | null = null;
  try {
    capture = await startCapture(tab.id);
    await ensureFacebookReviewTabAuthenticated(
      tab.id,
      capture,
      buildFacebookGroupUrl(groupId),
      callbacks.onLoginRequired,
    );
    if (postId) {
      return await probeKnownPost(input, groupId, postId, tab.id, capture);
    }
    return await probeUnknownPost(input, groupId, tab.id, capture);
  } catch (error) {
    return insufficient(input, `Facebook network status check failed: ${errorMessage(error)}`);
  } finally {
    if (capture) await capture.stop().catch(() => undefined);
    await closeTab(tab.id);
  }
}

async function ensureFacebookReviewTabAuthenticated(
  tabId: number,
  capture: CaptureSession,
  groupUrl: string,
  onLoginRequired?: () => void,
) {
  await navigateAndCapture(tabId, capture, groupUrl);
  let authState = await readFacebookReviewPageAuthState(tabId);
  if (authState.ready) return;

  onLoginRequired?.();
  await revealFacebookReviewLoginTab(tabId, authState.url);

  const deadline = Date.now() + REVIEW_LOGIN_WAIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(REVIEW_LOGIN_POLL_INTERVAL_MS);
    authState = await readFacebookReviewPageAuthState(tabId);
    if (!authState.ready) continue;

    await chrome.tabs?.update(tabId, { active: false });
    await navigateAndCapture(tabId, capture, groupUrl);
    return;
  }

  throw new Error('Facebook login is required before checking post status.');
}

async function readFacebookReviewPageAuthState(
  tabId: number,
): Promise<FacebookReviewPageAuthState> {
  const tab = await getChromeTabSafely(tabId);
  if (!tab) {
    return { ready: false, loginRequired: true, url: '' };
  }

  const fallbackState: FacebookReviewPageAuthState = {
    ready: false,
    loginRequired: isFacebookLoginLikeUrl(tab.url ?? ''),
    url: tab.url ?? '',
  };
  let pageState = fallbackState;

  try {
    const [result] = await chrome.scripting?.executeScript<[], FacebookReviewPageAuthState>({
      target: { tabId },
      func: readFacebookReviewPageAuthInPage,
      args: [],
    }) ?? [];
    if (result?.result) pageState = result.result;
  } catch {
    // Cookie state below remains the fallback when page scripting is unavailable.
  }

  if (pageState.loginRequired) return pageState;

  let cookieApiAvailable = typeof chrome.cookies?.get === 'function';
  try {
    const cookie = await chrome.cookies?.get({ url: `${FB_ORIGIN}/`, name: 'c_user' });
    if (/^\d+$/.test(cookie?.value?.trim() ?? '')) {
      return { ...pageState, ready: true, loginRequired: false };
    }
  } catch {
    cookieApiAvailable = false;
  }

  return cookieApiAvailable
    ? { ...pageState, ready: false, loginRequired: true }
    : pageState;
}

function readFacebookReviewPageAuthInPage(): FacebookReviewPageAuthState {
  const url = window.location.href;
  const pathname = new URL(url).pathname.toLowerCase();
  const loginLike = /\/(?:login|checkpoint(?:\/|$)|recover(?:\/|$)|confirmemail(?:\/|$)|two_step(?:\/|$)|login_identify(?:\/|$))/.test(pathname);
  const hasLoginForm = Boolean(document.querySelector(
    'form[action*="login" i], input[type="password"], input[name="pass"], input[name="email"]',
  ));
  const bodyText = (document.body?.innerText ?? '').toLowerCase().slice(0, 3_000);
  const loginRequired = loginLike || (hasLoginForm && /log in|login|đăng nhập|dang nhap/.test(bodyText));

  return {
    ready: document.readyState === 'complete'
      && /facebook\.com$/i.test(new URL(url).hostname)
      && !loginRequired,
    loginRequired,
    url,
  };
}

async function revealFacebookReviewLoginTab(
  tabId: number,
  currentUrl: string,
) {
  const loginUrl = isFacebookLoginLikeUrl(currentUrl)
    ? currentUrl
    : `${FB_ORIGIN}/login`;
  const tab = await chrome.tabs?.update(tabId, { url: loginUrl, active: true });
  if (tab?.windowId !== undefined) {
    await chrome.windows?.update(tab.windowId, { focused: true });
  }
}

function isFacebookLoginLikeUrl(value: string) {
  try {
    const url = new URL(value);
    return /facebook\.com$/i.test(url.hostname)
      && /\/(?:login|checkpoint|recover|confirmemail|two_step|login_identify)(?:\/|$)/i.test(url.pathname);
  } catch {
    return false;
  }
}

async function probeKnownPost(
  input: FacebookReviewNetworkInput,
  groupId: string,
  postId: string,
  tabId: number,
  capture: CaptureSession,
): Promise<FacebookReviewNetworkResult> {
  const postedUrl = buildFacebookGroupPostUrl(
    groupId,
    postId,
    'posts',
  );

  /*
   * STEP 1:
   * Check whether the pending post has been approved.
   */
  const postedResponses = await navigateAndCapture(
    tabId,
    capture,
    postedUrl,
  );

  if (
    hasRejectedPostPageEvidence(
      postedResponses,
      groupId,
      postId,
      postedUrl,
    )
  ) {
    return {
      facebookReviewStatus: 'REJECTED',
      message:
        'Facebook network response xác nhận bài viết bị từ chối hoặc không còn khả dụng.',
      evidence: 'REJECTED_POST_PAGE',
      externalPostId: postId,
      externalPostUrl: input.externalPostUrl ?? postedUrl,
    };
  }

  if (
    hasPostedRoute(
      postedResponses,
      groupId,
      postId,
      postedUrl,
    )
  ) {
    return {
      facebookReviewStatus: 'POSTED',
      message:
        'Facebook network response xác nhận bài viết đã được duyệt và đăng.',
      evidence: 'POST_ROUTE',
      externalPostId: postId,
      externalPostUrl: postedUrl,
    };
  }

  /*
   * STEP 2:
   * Probe the exact pending-post URL.
   *
   * This is important because my_pending_content may still contain
   * other posts while this specific post has already been rejected.
   */
  const directPendingEvidence =
    await probeDirectPendingPost(
      tabId,
      capture,
      groupId,
      postId,
    );
    console.warn('[FB_REVIEW_DIRECT_PENDING]',{
        groupId,
        postId,
        dataObserved:
        directPendingEvidence.dataObserved,
         explicitlyEmpty:
         directPendingEvidence.explicitlyEmpty,
         matchedPost:
         directPendingEvidence.matchedPost,
     },
     );
  if (directPendingEvidence.matchedPost) {
    return {
      facebookReviewStatus: 'PENDING_REVIEW',
      message:
        'Facebook network response xác nhận bài viết vẫn còn trong trang pending cụ thể.',
      evidence: 'PENDING_COLLECTION',
      externalPostId: postId,
      externalPostUrl:
        input.externalPostUrl
        ?? buildFacebookGroupPostUrl(groupId, postId, 'pending_posts'),
    };
  }
  const samples = historySamples(input);

  /*
   * STEP 3:
   * Try authoritative collections before falling back to
   * "the exact pending page became empty".
   */
  const publishedEvidence = await probeCollection({
    tabId,
    capture,
    groupId,
    kind: 'published',
    postId,
    samples,
  });

  if (publishedEvidence.matched) {
    return collectionResult({
      source: input,
      groupId,
      knownPostId: postId,
      kind: 'published',
      evidence: publishedEvidence,
    });
  }

  const declinedEvidence = await probeCollection({
    tabId,
    capture,
    groupId,
    kind: 'declined',
    postId,
    samples,
  });

  if (declinedEvidence.matched) {
    return collectionResult({
      source: input,
      groupId,
      knownPostId: postId,
      kind: 'declined',
      evidence: declinedEvidence,
    });
  }

  const removedEvidence = await probeCollection({
    tabId,
    capture,
    groupId,
    kind: 'removed',
    postId,
    samples,
  });

  if (removedEvidence.matched) {
    return collectionResult({
      source: input,
      groupId,
      knownPostId: postId,
      kind: 'removed',
      evidence: removedEvidence,
    });
  }

  /*
   * STEP 4:
   * The post may simply still be pending.
   */
  const pendingEvidence = await probeCollection({
    tabId,
    capture,
    groupId,
    kind: 'pending',
    postId,
    samples,
  });

  if (pendingEvidence.matched) {
    return collectionResult({
      source: input,
      groupId,
      knownPostId: postId,
      kind: 'pending',
      evidence: pendingEvidence,
    });
  }

  /*
   * STEP 5:
   * /posts/<id> did not resolve as POSTED,
   * exact /pending_posts/<id> returned an explicit empty state,
   * and the post is not in another known collection.
   *
   * This is the rejected case observed in Facebook.
   */
  if (
    directPendingEvidence.dataObserved
    && directPendingEvidence.explicitlyEmpty
  ) {
    return {
      facebookReviewStatus: 'REJECTED',
      message:
        'Facebook network response xác nhận bài viết không còn tồn tại trong trang pending cụ thể; cập nhật Bị từ chối.',
      evidence: 'EMPTY_PENDING_COLLECTION',
      externalPostId: postId,
      externalPostUrl:
        input.externalPostUrl ?? null,
    };
  }

  return insufficient(
    input,
    'Facebook network response chưa đủ bằng chứng để thay đổi trạng thái hiện tại.',
  );
}

async function probeUnknownPost(
  input: FacebookReviewNetworkInput,
  groupId: string,
  tabId: number,
  capture: CaptureSession,
): Promise<FacebookReviewNetworkResult> {
  const samples = historySamples(input);
  const pending = await probeCollection({ tabId, capture, groupId, kind: 'pending', postId: null, samples });
  if (pending.matched) return collectionResult({ source: input, groupId, knownPostId: pending.postId, kind: 'pending', evidence: pending });

  const order: CollectionKind[] = ['published', 'declined', 'removed'];
  for (const kind of order) {
    const evidence = await probeCollection({ tabId, capture, groupId, kind, postId: null, samples });
    if (!evidence.matched) continue;
    return collectionResult({ source: input, groupId, knownPostId: evidence.postId, kind, evidence });
  }

    if (hasStrongEmptyPendingEvidence(pending)) {
    return {
        facebookReviewStatus: 'REJECTED',
        message:
        'Facebook pending-content response trả về rỗng; cập nhật Bị từ chối.',
        evidence: 'EMPTY_PENDING_COLLECTION',
        externalPostId:
        normalizeId(input.externalPostId),
        externalPostUrl:
        normalizeText(input.externalPostUrl),
    };
    }

  return insufficient(input, 'Không có network evidence đủ mạnh để xác định bài UNKNOWN.');
}

interface ProbeCollectionInput {
  tabId: number;
  capture: CaptureSession;
  groupId: string;
  kind: CollectionKind;
  postId: string | null;
  samples: HistorySamples;
}

async function probeCollection(
  input: ProbeCollectionInput,
): Promise<CollectionEvidence> {
  let combinedEvidence = emptyCollectionEvidence();

  for (const url of collectionUrls(input.groupId, input.kind)) {
    const responses = await navigateAndCapture(
      input.tabId,
      input.capture,
      url,
    );

    const evidence = inspectCollection(
      responses,
      {
        groupId: input.groupId,
        kind: input.kind,
        url,
        postId: input.postId,
        samples: input.samples,
      },
    );

    console.warn(
      '[FB_REVIEW_COLLECTION_EVIDENCE]',
      {
        kind: input.kind,
        groupId: input.groupId,
        postId: input.postId,
        url,
        responseCount: responses.length,
        matched: evidence.matched,
        routeLoaded: evidence.routeLoaded,
        dataObserved: evidence.dataObserved,
        explicitlyEmpty: evidence.explicitlyEmpty,
        recoveredPostId: evidence.postId,
      },
    );

    if (evidence.matched) return evidence;
    combinedEvidence = combineCollectionEvidence(combinedEvidence, evidence);
  }

  return combinedEvidence;
}

function emptyCollectionEvidence(): CollectionEvidence {
  return {
    matched: false,
    routeLoaded: false,
    dataObserved: false,
    explicitlyEmpty: false,
    postId: null,
    postUrl: null,
  };
}

function combineCollectionEvidence(
  first: CollectionEvidence,
  second: CollectionEvidence,
): CollectionEvidence {
  return {
    matched: first.matched || second.matched,
    routeLoaded: first.routeLoaded || second.routeLoaded,
    dataObserved: first.dataObserved || second.dataObserved,
    explicitlyEmpty: first.explicitlyEmpty || second.explicitlyEmpty,
    postId: first.postId ?? second.postId,
    postUrl: first.postUrl ?? second.postUrl,
  };
}

function hasStrongEmptyPendingEvidence(
  evidence: CollectionEvidence,
) {
  return evidence.dataObserved
    && evidence.explicitlyEmpty;
}

function inspectCollection(
  responses: CapturedResponse[],
  input: {
    groupId: string;
    kind: CollectionKind;
    url: string;
    postId: string | null;
    samples: HistorySamples;
  },
): CollectionEvidence {
  const routeLoaded = hasCollectionRoute(responses, input.groupId, input.kind, input.url);
  const dataObserved = responses.some((response) => isCollectionDataResponse(response, input));
  let explicitlyEmpty = false;

  for (const response of responses) {
    if (isBulkRoute(response.url)) continue;
    const collectionResponse =
    isCollectionDataResponse(
      response,
      input,
    );
    if (!collectionResponse) continue;
    const text = searchableText(response.body);
    if (!text) continue;

    if (isExplicitlyEmptyPendingResponse(response, text, input)) explicitlyEmpty = true;

    let matched = false;
    if (input.postId) {
      matched = text.includes(input.postId) && text.includes(input.groupId);
    } else {
      matched = matchesHistory(text, input.samples);
    }
    if (!matched) continue;

    const postUrl = recoverPostUrl(text, input.groupId, input.postId, input.kind);
    return {
      matched: true,
      routeLoaded,
      dataObserved,
      explicitlyEmpty: false,
      postId: parseFacebookGroupPostUrl(postUrl)?.postId ?? input.postId,
      postUrl,
    };
  }

  return {
    matched: false,
    routeLoaded,
    dataObserved,
    explicitlyEmpty,
    postId: null,
    postUrl: null,
  };
}

interface CollectionResultInput {
  source: FacebookReviewNetworkInput;
  groupId: string;
  knownPostId: string | null;
  kind: CollectionKind;
  evidence: CollectionEvidence;
}

interface DirectPendingPostEvidence {
  routeLoaded: boolean;
  matchedPost: boolean;
  dataObserved: boolean;
  explicitlyEmpty: boolean;
}

function hasExplicitPendingEmptyText(
  value: string,
) {
  const text = normalized(value);

  return [
    'chua co bai viet nao de xem xet',
    'khong co bai viet nao dang cho xem xet',
    'no posts to review',
    'no pending posts',
    'no posts pending review',
    'nothing to review',
  ].some((phrase) => text.includes(phrase));
}

function collectionResult(input: CollectionResultInput): FacebookReviewNetworkResult {
  const config = COLLECTIONS[input.kind];
  const postId = input.evidence.postId ?? input.knownPostId;
  let postUrl = input.evidence.postUrl;

  if (!postUrl && postId && input.kind === 'pending') {
    postUrl = buildFacebookGroupPostUrl(input.groupId, postId, 'pending_posts');
  }
  if (!postUrl && postId && input.kind === 'published') {
    postUrl = buildFacebookGroupPostUrl(input.groupId, postId, 'posts');
  }
  if (!postUrl) postUrl = normalizeText(input.source.externalPostUrl);

  return {
    // The refresh workflow intentionally exposes only POSTED, PENDING_REVIEW,
    // and REJECTED. Facebook's removed collection is the negative outcome of
    // the pending review lifecycle, so normalize it at this boundary.
    facebookReviewStatus:
      input.kind === 'removed' ? 'REJECTED' : config.status,
    message: `Facebook network response xác nhận bài nằm trong ${input.kind} collection.`,
    evidence: config.evidence,
    externalPostId: postId,
    externalPostUrl: postUrl,
  };
}

async function startCapture(
  tabId: number,
): Promise<CaptureSession> {
  const debuggerApi = chrome.debugger;

  if (!debuggerApi) {
    throw new Error(
      'chrome.debugger API không khả dụng.',
    );
  }

  const target = { tabId };
  const requests = new Map<string, RequestMeta>();
  const responses: CapturedResponse[] = [];
  const tasks = new Set<Promise<void>>();

  let stopped = false;
  let attached = false;
  let lastNetworkActivityAt = Date.now();

  const markNetworkActivity = () => {
    lastNetworkActivityAt = Date.now();
  };

  const readBody = async (
    request: RequestMeta,
  ) => {
    try {
      const response =
        await sendChromeDebuggerCommand<{
          body?: string;
          base64Encoded?: boolean;
        }>(
          target,
          'Network.getResponseBody',
          {
            requestId: request.requestId,
          },
        );

      const body =
        decodeChromeDebuggerResponseBody(
          response,
        );

      if (
        !body
        || responses.length >= MAX_RESPONSES
      ) {
        return;
      }

      responses.push({
        url: request.url,
        type: request.type,
        postData: request.postData,
        body: body.slice(
          0,
          MAX_BODY_LENGTH,
        ),
      });
    } catch (error) {
      console.warn(
        '[FB_REVIEW_NETWORK_BODY_FAILED]',
        {
          tabId,
          url: request.url,
          message: errorMessage(error),
        },
      );
    } finally {
      requests.delete(
        request.requestId,
      );

      markNetworkActivity();
    }
  };

  const track = (
    task: Promise<void>,
  ) => {
    tasks.add(task);

    task.then(
      () => {
        tasks.delete(task);
      },
      () => {
        tasks.delete(task);
      },
    );
  };

  const handleRequestWillBeSent = (
    params?: Record<string, unknown>,
  ) => {
    const event =
      params as
        | RequestWillBeSentParams
        | undefined;

    const requestId =
      event?.requestId;

    const request =
      event?.request;

    const type =
      event?.type ?? '';

    const url =
      request?.url ?? '';

    if (
      !requestId
      || !request
      || !shouldCapture(url, type)
    ) {
      return;
    }

    requests.set(
      requestId,
      {
        requestId,
        url,
        type,
        postData:
          request.postData ?? '',
      },
    );

    markNetworkActivity();
  };

  const handleLoadingFailed = (
    params?: Record<string, unknown>,
  ) => {
    const event =
      params as
        | LoadingFinishedParams
        | undefined;

    const requestId =
      event?.requestId;

    if (!requestId) {
      return;
    }

    const trackedRequest =
      requests.has(requestId);

    requests.delete(requestId);

    if (trackedRequest) {
      markNetworkActivity();
    }
  };

  const handleLoadingFinished = (
    params?: Record<string, unknown>,
  ) => {
    const event =
      params as
        | LoadingFinishedParams
        | undefined;

    const requestId =
      event?.requestId;

    if (!requestId) {
      return;
    }

    const request =
      requests.get(requestId);

    if (!request) {
      return;
    }

    markNetworkActivity();

    track(
      readBody(request),
    );
  };

  const onEvent = (
    source: ChromeDebuggee,
    method: string,
    params?: Record<string, unknown>,
  ) => {
    if (
      source.tabId !== tabId
      || stopped
    ) {
      return;
    }

    if (
      method
      === 'Network.requestWillBeSent'
    ) {
      handleRequestWillBeSent(
        params,
      );

      return;
    }

    if (
      method
      === 'Network.loadingFailed'
    ) {
      handleLoadingFailed(
        params,
      );

      return;
    }

    if (
      method
      === 'Network.loadingFinished'
    ) {
      handleLoadingFinished(
        params,
      );
    }
  };

  const waitTasks = async () => {
    if (tasks.size === 0) {
      return;
    }

    await Promise.allSettled(
      [...tasks],
    );
  };

  const waitForSettled = async (
    minimumMs: number,
    maximumMs: number,
    quietMs: number,
  ) => {
    const startedAt =
      Date.now();

    const deadline =
      startedAt
      + Math.max(
        minimumMs,
        maximumMs,
      );

    while (
      Date.now() < deadline
    ) {
      await waitTasks();

      const now =
        Date.now();

      const elapsedMs =
        now - startedAt;

      const quietDurationMs =
        now
        - lastNetworkActivityAt;

      const minimumElapsed =
        elapsedMs >= minimumMs;

      const networkIsQuiet =
        quietDurationMs >= quietMs;

      const noPendingRequests =
        requests.size === 0;

      const noPendingTasks =
        tasks.size === 0;

      if (
        minimumElapsed
        && networkIsQuiet
        && noPendingRequests
        && noPendingTasks
      ) {
        return;
      }

      await sleep(200);
    }

    /*
     * Do one final wait so that response-body reads already
     * started near the deadline are included in snapshot().
     */
    await waitTasks();
  };

  await attachChromeDebugger(
    target,
    DEBUGGER_VERSION,
  );

  attached = true;

  debuggerApi.onEvent.addListener(
    onEvent,
  );

  try {
    await sendChromeDebuggerCommand(
      target,
      'Network.enable',
      {},
    );

    await sendChromeDebuggerCommand(
      target,
      'Network.setCacheDisabled',
      {
        cacheDisabled: true,
      },
    );
  } catch (error) {
    stopped = true;

    debuggerApi.onEvent.removeListener(
      onEvent,
    );

    if (attached) {
      attached = false;

      await detachChromeDebugger(
        target,
      ).catch(() => undefined);
    }

    throw error;
  }

  return {
    reset: async () => {
      await waitTasks();

      requests.clear();
      responses.length = 0;

      /*
       * Start measuring network quiet time from the next
       * navigation instead of inheriting the previous page.
       */
      lastNetworkActivityAt =
        Date.now();
    },

    waitForSettled,

    snapshot: async () => {
      await waitTasks();

      return [...responses];
    },

    stop: async () => {
      if (stopped) {
        return;
      }

      stopped = true;

      await waitTasks();

      debuggerApi.onEvent.removeListener(
        onEvent,
      );

      requests.clear();

      await sendChromeDebuggerCommand(
        target,
        'Network.disable',
        {},
      ).catch(() => undefined);

      if (attached) {
        attached = false;

        await detachChromeDebugger(
          target,
        ).catch(() => undefined);
      }
    },
  };
}

async function navigateAndCapture(
  tabId: number,
  capture: CaptureSession,
  url: string,
) {
  await capture.reset();

  const previousTab =
    await getChromeTabSafely(tabId);

  const previousUrl =
    previousTab?.url ?? '';

  const updatedTab =
    await chrome.tabs?.update?.(
      tabId,
      {
        url,
        active: false,
      },
    );

  if (!updatedTab) {
    throw new Error(
      'Chrome tabs API could not navigate the hidden Facebook status-check tab.',
    );
  }

  await waitNavigation(
    tabId,
    previousUrl,
  );

  /*
   * Facebook finishes Document navigation before Relay/GraphQL data
   * required by pending/declined pages has necessarily completed.
   */
  await capture.waitForSettled(
    4_000,
    12_000,
    1_000,
  );

  await assertHiddenReviewTabInactive(
    tabId,
  );

  const responses =
    await capture.snapshot();

  logFacebookReviewCaptureSummary(
    url,
    responses,
  );

  return responses;
}

function logFacebookReviewCaptureSummary(
  navigationUrl: string,
  responses: CapturedResponse[],
) {
  console.warn(
    '[FB_REVIEW_CAPTURE_SUMMARY]',
    {
      navigationUrl,
      responseCount:
        responses.length,

      responses:
        responses
          .slice(0, 40)
          .map((response) => ({
            type:
              response.type,

            url:
              response.url,

            friendlyName:
              isGraphql(response.url)
                ? readGraphqlFriendlyName(
                  response.postData,
                )
                : null,

            bodyLength:
              response.body.length,
          })),
    },
  );
}

async function getChromeTabSafely(tabId: number) {
  try {
    return await chrome.tabs?.get?.(tabId) ?? null;
  } catch {
    return null;
  }
}

async function assertHiddenReviewTabInactive(
  tabId: number,
) {
  const existingTab = await getChromeTabSafely(tabId);

  if (!existingTab) {
    throw new Error(
      'Hidden review-status tab is unavailable after Facebook navigation.',
    );
  }

  const activeTabs =
    await chrome.tabs?.query?.({
      active: true,
    }) ?? [];

  const probeTabIsActive = activeTabs.some(
    (candidate) => candidate.id === tabId,
  );

  if (probeTabIsActive) {
    throw new Error(
      'Hidden review-status tab unexpectedly became active.',
    );
  }
}

function shouldCapture(
  value: string,
  type: string,
) {
  if (!CAPTURE_TYPES.has(type)) {
    return false;
  }

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return false;
  }

  const host =
    url.hostname.toLowerCase();

  const isFacebook =
    host === 'facebook.com'
    || host.endsWith('.facebook.com');

  if (!isFacebook) {
    return false;
  }

  if (type === 'Document') {
    return true;
  }

  if (isGraphql(value)) {
    return true;
  }

  return url.pathname.startsWith('/ajax/');
}

function responseHasEmptyCollection(
  body: string,
) {
  const payload =
    parseJson(body);

  if (!payload) {
    return false;
  }

  const state = {
    found: false,
    nonEmpty: false,
  };

  inspectLists(
    payload,
    state,
    0,
  );

  return state.found
    && !state.nonEmpty;
}

export function hasPostedRoute(
  responses: CapturedResponse[],
  groupId: string,
  postId: string,
  postedUrl: string,
) {
  // Facebook can resolve a pending post through the normal /posts/{id}/ route
  // and still return the same CometSinglePostDialogRoute definition as a
  // published post. The page payload is authoritative in this case: the
  // pending HAR contains both the pending layout/copy and the exact
  // /pending_posts/{id}/ URL for the same story.
  if (hasPendingPostPageEvidence(responses, groupId, postId)) {
    return false;
  }

  const expectedPath = urlPath(postedUrl);

  for (const route of routeDefinitions(responses)) {
    if (
      route.error
      || urlPath(route.routeUrl) !== expectedPath
    ) {
      continue;
    }

    if (
      route.canonicalRouteName
      !== 'comet.fbweb.CometSinglePostDialogRoute'
    ) {
      continue;
    }

    if (
      route.tracePolicy
      !== 'comet.post.single_dialog.group'
    ) {
      continue;
    }

    if (
      route.groupId
      && route.groupId !== groupId
    ) {
      continue;
    }

    if (!route.storyId) {
      continue;
    }

    if (!storyMatches(route.storyId, postId)) {
      continue;
    }

    return true;
  }

  return false;
}

export function hasRejectedPostPageEvidence(
  responses: CapturedResponse[],
  groupId: string,
  postId: string,
  postedUrl: string,
) {
  const expectedPath = urlPath(postedUrl);
  if (expectedPath !== `/groups/${groupId}/posts/${postId}`) return false;

  const hasErrorRoute = routeDefinitions(responses).some((route) =>
    route.error
    && urlPath(route.routeUrl) === expectedPath,
  );

  if (!hasErrorRoute) return false;

  return responses.some((response) => {
    if (
      response.type !== 'Document'
      || urlPath(response.url) !== expectedPath
    ) {
      return false;
    }

    return true;
  });
}

function hasPendingPostPageEvidence(
  responses: CapturedResponse[],
  groupId: string,
  postId: string,
) {
  const pendingPath = `/groups/${groupId}/pending_posts/${postId}`;
  const escapedPendingPath = pendingPath.replaceAll('/', '\\/');

  return responses.some((response) => {
    const text = searchableText(response.body);
    if (!text || !text.includes(groupId) || !text.includes(postId)) return false;

    const normalizedText = normalized(text);
    const hasPendingUrl = text.includes(pendingPath)
      || text.includes(escapedPendingPath);
    const hasPendingPageMarker = text.includes('CometStoryPendingParticipationPostLayoutStrategy')
      || normalizedText.includes('bai viet dang cho phe duyet')
      || normalizedText.includes('bai viet cua ban dang cho quan tri vien phe duyet')
      || normalizedText.includes('your post is pending approval');

    return hasPendingUrl || hasPendingPageMarker;
  });
}

function hasCollectionRoute(
  responses: CapturedResponse[],
  groupId: string,
  kind: CollectionKind,
  url: string,
) {
  const config = COLLECTIONS[kind];
  const expectedPath = urlPath(url);
  return routeDefinitions(responses).some((route) => {
    if (route.error || urlPath(route.routeUrl) !== expectedPath) return false;
    if (
      route.canonicalRouteName
      && !config.routeNames.includes(route.canonicalRouteName)
    ) return false;
    if (route.groupId && route.groupId !== groupId) return false;
    if (
      route.section
      && !config.sections.some(
        (section) => normalized(route.section ?? '') === normalized(section),
      )
    ) return false;
    return true;
  });
}

function isCollectionDataResponse(
  response: CapturedResponse,
  input: {
    groupId: string;
    kind: CollectionKind;
    url: string;
  },
) {
  if (response.type === 'Document') {
    return urlPath(response.url)
      === urlPath(input.url);
  }

  if (
    response.type !== 'XHR'
    && response.type !== 'Fetch'
  ) {
    return false;
  }

  if (isBulkRoute(response.url)) {
    return false;
  }

  if (!hasUsableResponsePayload(response.body)) {
    return false;
  }

  const friendlyName =
    readGraphqlFriendlyName(
      response.postData,
    );

  if (
    friendlyName
    && friendlyName
      .toLowerCase()
      .includes('mutation')
  ) {
      return false;
  }

  const routeName = readFacebookRouteName(
    response.url,
    response.postData,
  );
  if (
    routeName
    && COLLECTIONS[input.kind].routeNames.includes(routeName)
  ) {
    return true;
  }

  if (friendlyNameMatchesCollection(friendlyName, input.kind)) {
    return true;
  }

  return responseContainsGroup(response, input.groupId)
    && responseBodyMatchesCollectionKind(response.body, input.kind);
}

function hasUsableResponsePayload(body: string) {
  const payload = parseJson(body);
  if (payload === null) return false;

  const record = asRecord(payload);
  return !(
    record
    && Object.prototype.hasOwnProperty.call(record, 'payload')
    && record.payload === null
  );
}

function readFacebookRouteName(responseUrl: string, postData: string) {
  try {
    const routeFromUrl = new URL(responseUrl, 'https://www.facebook.com')
      .searchParams
      .get('__crn')
      ?.trim();
    if (routeFromUrl) return routeFromUrl;
  } catch {
    // The route name may be encoded in the POST body for GraphQL requests.
  }

  if (!postData) return '';
  return new URLSearchParams(postData).get('__crn')?.trim() ?? '';
}

function responseContainsGroup(
  response: CapturedResponse,
  groupId: string,
) {
  if (response.postData.includes(groupId)) {
    return true;
  }

  return response.body.includes(groupId);
}

function friendlyNameMatchesCollection(
  value: string,
  kind: CollectionKind,
) {
  const name = value.toLowerCase();

  if (kind === 'pending') {
    return name.includes('pending');
  }

  if (kind === 'published') {
    return name.includes('published')
      || name.includes('posted');
  }

  if (kind === 'declined') {
    return name.includes('declined')
      || name.includes('rejected');
  }

  return name.includes('removed');
}

function responseBodyMatchesCollectionKind(
  body: string,
  kind: CollectionKind,
) {
  const value =
    normalized(body);

  if (kind === 'pending') {
    return value.includes('my_pending_content')
      || value.includes('pending_content')
      || value.includes('pending');
  }

  if (kind === 'published') {
    return value.includes('my_posted_content')
      || value.includes('published');
  }

  if (kind === 'declined') {
    return value.includes('my_declined_content')
      || value.includes('declined')
      || value.includes('rejected');
  }

  return value.includes('my_removed_content')
    || value.includes('removed');
}

function isExplicitlyEmptyPendingResponse(
  response: CapturedResponse,
  text: string,
  input: {
    groupId: string;
    kind: CollectionKind;
    url: string;
  },
) {
  if (input.kind !== 'pending') {
    return false;
  }

  if (!isCollectionDataResponse(response, input)) {
    return false;
  }

  if (hasExplicitPendingEmptyText(text)) {
    return true;
  }

  const friendlyName =
    readGraphqlFriendlyName(response.postData);

  if (
    friendlyName
    && friendlyName.toLowerCase().includes('mutation')
  ) {
    return false;
  }

  if (
    friendlyName
    && !isLikelyCollectionQueryName(friendlyName)
  ) {
    return false;
  }

  const payload = parseJson(response.body);

  if (!payload) {
    return false;
  }

  const state = {
    found: false,
    nonEmpty: false,
  };

  inspectLists(payload, state, 0);

  return state.found && !state.nonEmpty;
}

async function probeDirectPendingPost(
  tabId: number,
  capture: CaptureSession,
  groupId: string,
  postId: string,
): Promise<DirectPendingPostEvidence> {
  const pendingUrl = buildFacebookGroupPostUrl(
    groupId,
    postId,
    'pending_posts',
  );

  const responses = await navigateAndCapture(
    tabId,
    capture,
    pendingUrl,
  );

  return inspectDirectPendingPost(
    responses,
    pendingUrl,
    groupId,
  );
}

function inspectDirectPendingPost(
  responses: CapturedResponse[],
  pendingUrl: string,
  groupId: string,
): DirectPendingPostEvidence {
  const expectedPath = urlPath(pendingUrl);

  const routeLoaded = hasCollectionRoute(
    responses,
    groupId,
    'pending',
    pendingUrl,
  );
  let matchedPost = false;
  let dataObserved = false;
  let explicitlyEmpty = false;

  for (const response of responses) {
    if (isBulkRoute(response.url)) {
      continue;
    }

    const isExactDocument =
      response.type === 'Document'
      && urlPath(response.url) === expectedPath;
    const isCollectionResponse = isCollectionDataResponse(
      response,
      {
        groupId,
        kind: 'pending',
        url: pendingUrl,
      },
    );

    const isRelevantFacebookResponse =
      isExactDocument
      || isCollectionResponse
      || (
        (
          response.type === 'XHR'
          || response.type === 'Fetch'
        )
        && responseContainsGroup(
          response,
          groupId,
        )
      );

    if (!isRelevantFacebookResponse) {
      continue;
    }

    if (!isExactDocument && !hasUsableResponsePayload(response.body)) {
      continue;
    }

    const friendlyName =
      readGraphqlFriendlyName(
        response.postData,
      );

    if (
      friendlyName
      && friendlyName
        .toLowerCase()
        .includes('mutation')
    ) {
      continue;
    }

    const text =
      searchableText(
        response.body,
      );

    if (!text) {
      continue;
    }

    dataObserved = true;
    if (text.includes(groupId) && text.includes(expectedPath.split('/').at(-1) ?? '')) {
      matchedPost = true;
    }

    const hasEmptyText =
      hasExplicitPendingEmptyText(
        text,
      );

    const hasEmptyCollection =
      responseHasEmptyCollection(
        response.body,
      );

    if (
      hasEmptyText
      || hasEmptyCollection
    ) {
      explicitlyEmpty = true;
    }
  }

  return {
    routeLoaded,
    matchedPost,
    dataObserved,
    explicitlyEmpty,
  };
}

function readGraphqlFriendlyName(postData: string) {
  if (!postData) return '';
  const params = new URLSearchParams(postData);
  return params.get('fb_api_req_friendly_name')?.trim() ?? '';
}

function isLikelyCollectionQueryName(value: string) {
  const name = value.toLowerCase();
  return name.includes('pending')
    || name.includes('viewercontent')
    || name.includes('group')
    || name.includes('post')
    || name.includes('story')
    || name.includes('feed');
}

function inspectLists(value: unknown, state: { found: boolean; nonEmpty: boolean }, depth: number) {
  if (depth > 8 || state.nonEmpty) return;
  if (Array.isArray(value)) {
    for (const item of value) {
      inspectLists(item, state, depth + 1);
      if (state.nonEmpty) return;
    }
    return;
  }
  const record = asRecord(value);
  if (!record) return;
  for (const [key, child] of Object.entries(record)) {
    if (EMPTY_LIST_KEYS.has(key.toLowerCase()) && Array.isArray(child)) {
      state.found = true;
      if (child.length > 0) {
        state.nonEmpty = true;
        return;
      }
    }
    inspectLists(child, state, depth + 1);
    if (state.nonEmpty) return;
  }
}

function routeDefinitions(responses: CapturedResponse[]) {
  const output: RouteDefinition[] = [];
  for (const response of responses) {
    if (!isBulkRoute(response.url)) continue;
    const root = asRecord(parseJson(response.body));
    const payload = asRecord(root?.payload);
    const payloads = asRecord(payload?.payloads);
    if (!payloads) continue;

    for (const [routeUrl, raw] of Object.entries(payloads)) {
      const routePayload = asRecord(raw);
      const result = asRecord(routePayload?.result);
      const exportsValue = asRecord(result?.exports);
      const rootView = asRecord(exportsValue?.rootView);
      const props = asRecord(rootView?.props);
      output.push({
        routeUrl,
        error: routePayload?.error === true,
        canonicalRouteName: stringValue(exportsValue?.canonicalRouteName),
        tracePolicy: stringValue(exportsValue?.tracePolicy),
        groupId: stringValue(props?.groupID),
        section: stringValue(props?.section),
        storyId: stringValue(props?.storyID),
      });
    }
  }
  return output;
}

function searchableText(body: string) {
  const payload = parseJson(body);
  if (payload === null) return body.slice(0, MAX_BODY_LENGTH);
  const strings: string[] = [];
  collectStrings(payload, strings, 0);
  return strings.join('\n').slice(0, MAX_BODY_LENGTH);
}

function collectStrings(value: unknown, output: string[], depth: number) {
  if (depth > 8 || output.length >= 4_000) return;
  if (typeof value === 'string') {
    output.push(value.slice(0, 4_000));
    return;
  }
  if (Array.isArray(value)) {
    for (const child of value) collectStrings(child, output, depth + 1);
    return;
  }
  const record = asRecord(value);
  if (!record) return;
  for (const [key, child] of Object.entries(record)) {
    if (key.includes('/groups/')) output.push(key);
    collectStrings(child, output, depth + 1);
  }
}

function matchesHistory(text: string, samples: HistorySamples) {
  const value = normalized(text);
  let required = 0;
  let matched = 0;
  if (samples.title) {
    required += 1;
    if (value.includes(samples.title)) matched += 1;
  }
  if (samples.content) {
    required += 1;
    if (value.includes(samples.content)) matched += 1;
  }
  return required > 0 && required === matched;
}

function historySamples(input: FacebookReviewNetworkInput): HistorySamples {
  return {
    title: sample(input.title, 100, 16),
    content: sample(input.contentPreview, 120, 28),
  };
}

function recoverPostUrl(text: string, groupId: string, postId: string | null, kind: CollectionKind) {
  const urls = collectPostUrls(text, groupId);
  if (postId) {
    return urls.find((url) => parseFacebookGroupPostUrl(url)?.postId === postId) ?? null;
  }
  const preferred = kind === 'pending' ? 'pending_posts' : 'posts';
  const preferredUrls = urls.filter((url) => parseFacebookGroupPostUrl(url)?.pathType === preferred);
  if (preferredUrls.length === 1) return preferredUrls[0] ?? null;
  if (urls.length === 1) return urls[0] ?? null;
  return null;
}

function collectPostUrls(text: string, groupId: string) {
  const output = new Set<string>();
  collectRouteUrls(text, groupId, 'posts', output);
  collectRouteUrls(text, groupId, 'pending_posts', output);
  collectRouteUrls(text, groupId, 'permalink', output);
  return [...output];
}

function collectRouteUrls(
  text: string,
  groupId: string,
  segment: 'posts' | 'pending_posts' | 'permalink',
  output: Set<string>,
) {
  const marker = `/groups/${groupId}/${segment}/`;
  let index = text.indexOf(marker);
  while (index >= 0) {
    const start = index + marker.length;
    const postId = readPostToken(text, start);
    if (postId) {
      const pathType = segment === 'pending_posts' ? 'pending_posts' : 'posts';
      output.add(buildFacebookGroupPostUrl(groupId, postId, pathType));
    }
    index = text.indexOf(marker, start);
  }
}

function readPostToken(text: string, start: number) {
  let end = start;
  while (end < text.length && postCharacter(text[end] ?? '')) end += 1;
  const token = text.slice(start, end).trim();
  return token.length >= 5 ? token : null;
}

function postCharacter(value: string) {
  if (value.length !== 1) return false;
  const code = value.charCodeAt(0);
  return (code >= 48 && code <= 57)
    || (code >= 65 && code <= 90)
    || (code >= 97 && code <= 122)
    || value === '_'
    || value === '-';
}

function parseJson(body: string) {
  let text = body.trim();
  if (text.startsWith(JSON_PREFIX)) text = text.slice(JSON_PREFIX.length);
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function storyMatches(storyId: string, postId: string) {
  if (storyId.includes(postId)) return true;
  try {
    const binary = globalThis.atob(storyId);
    const bytes = Uint8Array.from(binary, (char) => char.codePointAt(0) ?? 0);
    return new TextDecoder().decode(bytes).includes(postId);
  } catch {
    return false;
  }
}

function collectionUrls(groupId: string, kind: CollectionKind) {
  return COLLECTIONS[kind].suffixes.map(
    (suffix) => `${FB_ORIGIN}/groups/${encodeURIComponent(groupId)}/${suffix}`,
  );
}

function buildFacebookGroupUrl(groupId: string) {
  return `${FB_ORIGIN}/groups/${encodeURIComponent(groupId)}`;
}

function readGroupId(value: string | null | undefined) {
  const url = normalizeText(value);
  if (!url) return null;
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    if (parts[0]?.toLowerCase() !== 'groups') return null;
    return normalizeId(parts[1]);
  } catch {
    return null;
  }
}

function sample(value: string | null | undefined, max: number, min: number) {
  const result = normalized(value ?? '');
  if (result.length < min) return null;
  return result.slice(0, max);
}

function normalized(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replaceAll('đ', 'd')
    .replaceAll('Đ', 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function insufficient(input: FacebookReviewNetworkInput, message: string): FacebookReviewNetworkResult {
  return {
    facebookReviewStatus: input.initialStatus,
    message,
    evidence: 'INSUFFICIENT',
    externalPostId: normalizeId(input.externalPostId),
    externalPostUrl: normalizeText(input.externalPostUrl),
  };
}

function normalizeId(value: string | null | undefined) {
  const result = value?.trim() ?? '';
  return result || null;
}

function normalizeText(value: string | null | undefined) {
  const result = value?.trim() ?? '';
  return result || null;
}

function urlPath(value: string) {
  try {
    let path = new URL(value, FB_ORIGIN).pathname;
    while (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
    return path;
  } catch {
    return '';
  }
}

function isBulkRoute(value: string) {
  try {
    return new URL(value).pathname === '/ajax/bulk-route-definitions/';
  } catch {
    return false;
  }
}

function isGraphql(value: string) {
  try {
    const path = new URL(value).pathname;
    return path === '/api/graphql/' || path === '/api/graphql';
  } catch {
    return false;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function stringValue(value: unknown) {
  if (typeof value !== 'string') return null;
  const result = value.trim();
  return result || null;
}

async function waitNavigation(
  tabId: number,
  previousUrl: string,
) {
  const deadline =
    Date.now() + NAVIGATION_TIMEOUT_MS;

  let navigationStarted = false;

  while (Date.now() < deadline) {
    const tab = await getChromeTabSafely(tabId);

    if (!tab) {
      throw new Error(
        'Hidden Facebook status-check tab đã bị đóng.',
      );
    }

    if (
      tab.url
      && tab.url !== previousUrl
    ) {
      navigationStarted = true;
    }

    if (
      navigationStarted
      && tab.status === 'complete'
    ) {
      return;
    }

    await sleep(250);
  }

  throw new Error(
    'Timeout khi chờ Facebook hidden tab hoàn tất navigation.',
  );
}

async function closeTab(tabId: number) {
  try {
    await chrome.tabs?.remove(tabId);
  } catch {
    // Hidden probe tab may already be closed.
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (
    typeof error === 'number'
    || typeof error === 'boolean'
    || typeof error === 'bigint'
  ) {
    return `${error}`;
  }

  return 'Unknown Facebook network capture error.';
}
