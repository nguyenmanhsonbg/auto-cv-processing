import {
  attachChromeDebugger,
  decodeChromeDebuggerResponseBody,
  detachChromeDebugger,
  sendChromeDebuggerCommand,
} from '@/integrations/chrome-debugger-utils';

const DEBUGGER_PROTOCOL_VERSION = '1.3';
const FACEBOOK_GROUPS_PAGE_URL = 'https://www.facebook.com/groups/joins/?nav_source=tab';
const FACEBOOK_GRAPHQL_PATH = '/api/graphql/';
const INITIAL_QUERY_NAME = 'GroupsCometJoinsRootQuery';
const PAGINATION_QUERY_NAME = 'GroupsCometAllJoinedGroupsSectionPaginationQuery';

// Facebook changes persisted query ids over time. This is only a last-resort
// fallback; the normal path captures the current pagination request live.
const FALLBACK_PAGINATION_DOC_ID = '9974006939348139';
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGES = 250;
const INITIAL_RESPONSE_TIMEOUT_MS = 20_000;
const INITIAL_REQUEST_TEMPLATE_FALLBACK_DELAY_MS = 5_000;
const PAGINATION_TEMPLATE_TIMEOUT_MS = 12_000;
const GRAPHQL_PAGE_INTERVAL_MS = 250;
const GRAPHQL_RETRY_DELAYS_MS = [750, 1_500, 3_000, 6_000];

export interface FacebookGraphqlGroup {
  targetName: string;
  targetUrl: string;
  targetExternalId: string;
}

export interface FacebookGraphqlCollectionResult {
  groups: FacebookGraphqlGroup[];
  scanComplete: boolean;
  expectedCount: number | null;
  source: 'graphql';
}

export interface FacebookGraphqlCaptureOptions {
  activateTab?: boolean;
}

interface CapturedGraphqlRequest {
  requestId: string;
  requestUrl: string;
  postData: string;
  headers: Record<string, string>;
  queryName: string;
}

interface CapturedGraphqlResponse {
  request: CapturedGraphqlRequest;
  status: number;
  body: string;
}

interface GraphqlPage {
  groups: FacebookGraphqlGroup[];
  endCursor: string | null;
  hasNextPage: boolean;
  totalCount: number | null;
}

interface NetworkRequestWillBeSentParams {
  requestId?: string;
  request?: {
    url?: string;
    method?: string;
    postData?: string;
    headers?: Record<string, unknown>;
  };
}

interface NetworkResponseReceivedParams {
  requestId?: string;
  response?: {
    url?: string;
    status?: number;
  };
}

interface NetworkLoadingFinishedParams {
  requestId?: string;
}

interface NetworkGetResponseBodyResult {
  body?: string;
  base64Encoded?: boolean;
}

interface FacebookGraphqlFetchResult {
  status: number;
  body: string;
}

interface GraphqlCaptureDiagnostics {
  phase: string;
  tabUrl: string | null;
  tabStatus: string | null;
  tabActive: boolean | null;
  scrollTarget: string | null;
  requestCount: number;
  candidateRequestCount: number;
  responseReceivedCount: number;
  loadingFinishedCount: number;
  responseBodySuccessCount: number;
  responseBodyFailureCount: number;
  initialCandidateCount: number;
  parseFailureCount: number;
  focusEmulationSupported: boolean | null;
  focusEmulationEnabled: boolean;
  lifecycleStateActive: boolean | null;
  visibilityState: string | null;
  documentHidden: boolean | null;
  temporaryActivationUsed: boolean;
  queryNames: Set<string>;
  lastBodyFailure: string | null;
}

interface FacebookPageRuntimeState {
  visibilityState: string;
  hidden: boolean;
  readyState: string;
  hasFocus: boolean;
}

export async function collectFacebookGroupsFromGraphql(
  tabId: number,
  expectedFacebookExternalId: string,
  onMessage?: (message: string) => void,
  options: FacebookGraphqlCaptureOptions = {},
): Promise<FacebookGraphqlCollectionResult | null> {
  const diagnostics = createDiagnostics();
  const report = (code: string, message: string, visible = false) => {
    diagnostics.phase = code;
    const line = `[FB_GQL_${code}] ${message}`;
    console.warn(line);
    if (visible) onMessage?.(line);
  };

  if (!chrome.debugger || !chrome.scripting || !chrome.tabs) {
    report('API_UNAVAILABLE', 'chrome.debugger/chrome.scripting/chrome.tabs không khả dụng.', true);
    return null;
  }

  const target = { tabId };
  const requests = new Map<string, CapturedGraphqlRequest>();
  const responses: CapturedGraphqlResponse[] = [];
  let attached = false;
  let focusEmulationEnabled = false;

  const onDebuggerEvent = (
    source: ChromeDebuggee,
    method: string,
    params?: Record<string, unknown>,
  ) => {
    if (source.tabId !== tabId) return;
    void handleDebuggerEvent(method, params);
  };

  try {
    report('START', `tabId=${tabId}`);
    onMessage?.('Đang mở phiên lấy danh sách nhóm Facebook...');
    await attachChromeDebugger(target, DEBUGGER_PROTOCOL_VERSION);
    attached = true;
    report('ATTACHED', 'Đã attach debugger vào tab Facebook.');
    chrome.debugger.onEvent.addListener(onDebuggerEvent);
    await sendChromeDebuggerCommand(target, 'Network.enable', {});
    await sendChromeDebuggerCommand(target, 'Page.enable', {}).catch(() => undefined);
    try {
      await sendChromeDebuggerCommand(target, 'Emulation.setFocusEmulationEnabled', { enabled: true });
      focusEmulationEnabled = true;
      diagnostics.focusEmulationSupported = true;
      diagnostics.focusEmulationEnabled = true;
      report('FOCUS_EMULATION_ENABLED', 'Facebook page focus emulation enabled.');
    } catch (error) {
      diagnostics.focusEmulationSupported = false;
      report('FOCUS_EMULATION_UNAVAILABLE', `Facebook page focus emulation unavailable: ${toErrorMessage(error)}`);
    }
    try {
      await sendChromeDebuggerCommand(target, 'Page.setWebLifecycleState', { state: 'active' });
      diagnostics.lifecycleStateActive = true;
      report('LIFECYCLE_ACTIVE', 'Facebook page lifecycle set to active.');
    } catch (error) {
      diagnostics.lifecycleStateActive = false;
      report('LIFECYCLE_UNAVAILABLE', `Facebook page lifecycle could not be set active: ${toErrorMessage(error)}`);
    }
    report('NETWORK_ENABLED', 'Đã bật Network domain, bắt đầu theo dõi request GraphQL.');

    const tabContext = await chrome.tabs.get(tabId) as ChromeTab & { active?: boolean };
    diagnostics.tabUrl = tabContext.url ?? null;
    diagnostics.tabStatus = tabContext.status ?? null;
    diagnostics.tabActive = tabContext.active ?? null;
    report(
      'TAB_CONTEXT',
      `tabId=${tabId}, active=${String(diagnostics.tabActive)}, status=${diagnostics.tabStatus ?? '(unknown)'}, url=${diagnostics.tabUrl ?? '(unknown)'}`,
    );

    await chrome.tabs.update(tabId, {
      url: FACEBOOK_GROUPS_PAGE_URL,
      active: options.activateTab === true,
    });
    report('NAVIGATED', 'Facebook groups URL đã được mở, chờ trang tải xong.');
    await waitForFacebookTabComplete(tabId);
    const readyTab = await chrome.tabs.get(tabId);
    diagnostics.tabUrl = readyTab.url ?? diagnostics.tabUrl;
    diagnostics.tabStatus = readyTab.status ?? diagnostics.tabStatus;
    diagnostics.tabActive = (readyTab as ChromeTab & { active?: boolean }).active ?? diagnostics.tabActive;
    const runtimeState = await readFacebookPageRuntimeState(tabId).catch(() => null);
    if (runtimeState) {
      diagnostics.visibilityState = runtimeState.visibilityState;
      diagnostics.documentHidden = runtimeState.hidden;
      report(
        'PAGE_RUNTIME_STATE',
        `visibility=${runtimeState.visibilityState}, hidden=${String(runtimeState.hidden)}, readyState=${runtimeState.readyState}, hasFocus=${String(runtimeState.hasFocus)}.`,
      );
    }
    report(
      'PAGE_READY',
      `Trang Facebook đã tải xong, kích hoạt lazy-load danh sách nhóm (url=${diagnostics.tabUrl ?? '(unknown)'}, active=${String(diagnostics.tabActive)}).`,
    );
    await sleep(750);
    const scrollResult = await nudgeFacebookGroupsPagination(tabId);
    diagnostics.scrollTarget = scrollResult.target;
    report(
      'LAZY_LOAD_TRIGGERED',
      `Đã scroll tuần tự một container để kích hoạt lazy-load danh sách nhóm (target=${scrollResult.target}, steps=${scrollResult.steps}).`,
    );

    return await collectFacebookGraphqlPages(
      tabId,
      expectedFacebookExternalId,
      responses,
      requests,
      diagnostics,
      onMessage,
    );
  } catch (error) {
    const message = `[FB_GQL_${diagnostics.phase}] ${toErrorMessage(error)}; ${formatDiagnostics(diagnostics)}`;
    console.warn(message);
    onMessage?.(`Không lấy được GraphQL danh sách nhóm, chuyển sang cơ chế dự phòng: ${message}`);
    return null;
  } finally {
    if (focusEmulationEnabled) {
      await sendChromeDebuggerCommand(target, 'Emulation.setFocusEmulationEnabled', { enabled: false })
        .catch(() => undefined);
    }
    try {
      chrome.debugger.onEvent.removeListener(onDebuggerEvent);
    } catch {
      // Listener cleanup is best-effort when the extension context is closing.
    }
    if (attached) await detachChromeDebugger(target).catch(() => undefined);
  }

  async function handleDebuggerEvent(method: string, params?: Record<string, unknown>) {
    if (method === 'Network.requestWillBeSent') {
      const event = params as NetworkRequestWillBeSentParams | undefined;
      const requestId = event?.requestId;
      const request = event?.request;
      const requestUrl = request?.url;
      const postData = request?.postData ?? '';
      if (!requestId || !requestUrl || !isFacebookGraphqlUrl(requestUrl)) return;

      diagnostics.requestCount += 1;
      const headers = normalizeHeaders(request.headers);
      const queryName = readQueryName(postData, headers) ?? '';
      diagnostics.queryNames.add(queryName || '(unknown)');
      if (!isPotentialGroupQueryName(queryName)) return;
      diagnostics.candidateRequestCount += 1;
      requests.set(requestId, {
        requestId,
        requestUrl,
        postData,
        headers,
        queryName,
      });
      return;
    }

    if (method === 'Network.responseReceived') {
      const event = params as NetworkResponseReceivedParams | undefined;
      const requestId = event?.requestId;
      const request = requestId ? requests.get(requestId) : undefined;
      if (!request) return;
      diagnostics.responseReceivedCount += 1;
      request.requestUrl = event?.response?.url ?? request.requestUrl;
      return;
    }

    if (method !== 'Network.loadingFinished') return;
    const event = params as NetworkLoadingFinishedParams | undefined;
    const requestId = event?.requestId;
    const request = requestId ? requests.get(requestId) : undefined;
    if (!request) return;
    diagnostics.loadingFinishedCount += 1;

    try {
      const response = await sendChromeDebuggerCommand<NetworkGetResponseBodyResult>(target, 'Network.getResponseBody', {
        requestId,
      });
      const body = decodeChromeDebuggerResponseBody(response);
      if (body) {
        diagnostics.responseBodySuccessCount += 1;
        responses.push({ request, status: 200, body });
      }
    } catch (error) {
      diagnostics.responseBodyFailureCount += 1;
      diagnostics.lastBodyFailure = toErrorMessage(error);
      console.warn(`[FB_GQL_BODY_FAILED] requestId=${requestId}; ${toErrorMessage(error)}`);
      // A response can disappear while Facebook replaces the document. The
      // next request or the DOM fallback can still complete the scan.
    }
  }
}

async function waitForInitialFacebookGraphqlResponse(
  tabId: number,
  responses: CapturedGraphqlResponse[],
  requests: Map<string, CapturedGraphqlRequest>,
  diagnostics: GraphqlCaptureDiagnostics,
  onMessage: ((message: string) => void) | undefined,
): Promise<Awaited<ReturnType<typeof waitForInitialGroupResponse>>> {
  const fallbackDelayMs = Math.min(
    INITIAL_REQUEST_TEMPLATE_FALLBACK_DELAY_MS,
    INITIAL_RESPONSE_TIMEOUT_MS,
  );
  try {
    return await waitForInitialGroupResponse(responses, fallbackDelayMs, diagnostics);
  } catch (error) {
    const recoveredCapture = await recoverInitialGraphqlResponseFromRequestTemplate(
      tabId,
      requests,
      onMessage,
    );
    if (recoveredCapture) return recoveredCapture;

    return await waitForInitialGroupResponse(
      responses,
      INITIAL_RESPONSE_TIMEOUT_MS - fallbackDelayMs,
      diagnostics,
    ).catch(() => {
      throw error;
    });
  }
}

async function recoverInitialGraphqlResponseFromRequestTemplate(
  tabId: number,
  requests: Map<string, CapturedGraphqlRequest>,
  onMessage: ((message: string) => void) | undefined,
): Promise<Awaited<ReturnType<typeof waitForInitialGroupResponse>> | null> {
  const candidates = Array.from(requests.values())
    .filter((request) => isPotentialGroupQueryName(request.queryName))
    .reverse();

  for (const request of candidates) {
    try {
      const response = await fetchGraphqlPageWithRetry(
        tabId,
        request.requestUrl,
        request.postData,
        request.headers,
        onMessage,
      );
      if (response.status < 200 || response.status >= 300) continue;

      return {
        response: { request, status: response.status, body: response.body },
        page: parseGraphqlPage(response.body),
      };
    } catch {
      // A stale request template can fail after Facebook replaces the page.
      // Try the next captured group request before falling back to CDP bodies.
    }
  }

  return null;
}
interface GraphqlCollectionState {
  collected: Map<string, FacebookGraphqlGroup>;
  expectedCount: number | null;
  currentPage: GraphqlPage;
  pageCount: number;
  paginationTemplate: CapturedGraphqlRequest | null;
}

async function resolveInitialGraphqlPage(
  tabId: number,
  initialResponse: CapturedGraphqlResponse,
  initialPage: GraphqlPage,
  onMessage: ((message: string) => void) | undefined,
): Promise<{ page: GraphqlPage; paginationTemplate: CapturedGraphqlRequest | null }> {
  const initialCursor = readGraphqlCursor(initialResponse.request.postData);
  const paginationTemplate = isPaginationQueryName(initialResponse.request.queryName)
    || Boolean(initialCursor)
    ? initialResponse.request
    : null;
  if (!initialCursor) return { page: initialPage, paginationTemplate };
  const firstPageResponse = await fetchGraphqlPageWithRetry(
    tabId,
    initialResponse.request.requestUrl,
    updateGraphqlVariables(initialResponse.request.postData, null),
    initialResponse.request.headers,
    onMessage,
  );
  if (firstPageResponse.status < 200 || firstPageResponse.status >= 300) {
    throw new Error(`Facebook GraphQL trả về HTTP ${firstPageResponse.status} khi lấy trang đầu.`);
  }
  return { page: parseGraphqlPage(firstPageResponse.body), paginationTemplate };
}

async function captureNaturalGraphqlPagination(
  tabId: number,
  responses: CapturedGraphqlResponse[],
  initialResponse: CapturedGraphqlResponse,
  state: GraphqlCollectionState,
  onMessage: ((message: string) => void) | undefined,
) {
  if (!state.currentPage.hasNextPage || !state.currentPage.endCursor || state.paginationTemplate) return;
  await nudgeFacebookGroupsPagination(tabId);
  const capture = await waitForPaginationGroupResponse(responses, PAGINATION_TEMPLATE_TIMEOUT_MS).catch(() => null);
  if (!capture) {
    state.paginationTemplate = createFallbackPaginationTemplate(initialResponse.request);
    return;
  }
  state.paginationTemplate = capture.response.request;
  mergeGroups(state.collected, capture.page.groups);
  state.expectedCount = state.expectedCount ?? capture.page.totalCount;
  state.currentPage = capture.page;
  state.pageCount += 1;
  onMessage?.(formatProgress(state.collected.size, state.expectedCount, state.pageCount));
}

async function collectRemainingGraphqlPages(
  tabId: number,
  state: GraphqlCollectionState,
  onMessage: ((message: string) => void) | undefined,
) {
  while (state.currentPage.hasNextPage && state.currentPage.endCursor && state.paginationTemplate && state.pageCount < MAX_PAGES) {
    const nextBody = updateGraphqlVariables(state.paginationTemplate.postData, state.currentPage.endCursor);
    await sleep(GRAPHQL_PAGE_INTERVAL_MS);
    const nextResponse = await fetchGraphqlPageWithRetry(
      tabId,
      state.paginationTemplate.requestUrl,
      nextBody,
      state.paginationTemplate.headers,
      onMessage,
    );
    if (nextResponse.status < 200 || nextResponse.status >= 300) {
      throw new Error(`Facebook GraphQL trả về HTTP ${nextResponse.status}.`);
    }
    const nextPage = parseGraphqlPage(nextResponse.body);
    if (nextPage.endCursor === state.currentPage.endCursor) {
      throw new Error('Facebook GraphQL trả về cursor lặp, dừng để tránh quét vô hạn.');
    }
    mergeGroups(state.collected, nextPage.groups);
    state.expectedCount = state.expectedCount ?? nextPage.totalCount;
    state.currentPage = nextPage;
    state.pageCount += 1;
    onMessage?.(formatProgress(state.collected.size, state.expectedCount, state.pageCount));
  }
}

async function collectFacebookGraphqlPages(
  tabId: number,
  expectedFacebookExternalId: string,
  responses: CapturedGraphqlResponse[],
  requests: Map<string, CapturedGraphqlRequest>,
  diagnostics: GraphqlCaptureDiagnostics,
  onMessage: ((message: string) => void) | undefined,
): Promise<FacebookGraphqlCollectionResult> {
  const initialCapture = await waitForInitialFacebookGraphqlResponse(
    tabId,
    responses,
    requests,
    diagnostics,
    onMessage,
  );
  const initialResponse = initialCapture.response;
  assertRequestBelongsToAccount(initialResponse.request.postData, expectedFacebookExternalId);
  const { page: initialPage, paginationTemplate } = await resolveInitialGraphqlPage(
    tabId,
    initialResponse,
    initialCapture.page,
    onMessage,
  );
  const state: GraphqlCollectionState = {
    collected: new Map<string, FacebookGraphqlGroup>(),
    expectedCount: initialPage.totalCount,
    currentPage: initialPage,
    pageCount: 1,
    paginationTemplate,
  };
  // The first captured response can already contain a valid page even when
  // its cursor is non-null and we rewind with a cursor=null request. Keep it;
  // otherwise one page is silently discarded when the pagination is merged.
  mergeGroups(state.collected, initialCapture.page.groups);
  mergeGroups(state.collected, initialPage.groups);

  onMessage?.(formatProgress(state.collected.size, state.expectedCount, state.pageCount));
  await captureNaturalGraphqlPagination(tabId, responses, initialResponse, state, onMessage);
  await collectRemainingGraphqlPages(tabId, state, onMessage);

  const reachedEnd = !state.currentPage.hasNextPage;
  const countMatches = state.expectedCount === null || state.collected.size >= state.expectedCount;
  const scanComplete = reachedEnd && countMatches && state.pageCount < MAX_PAGES;
  if (!scanComplete) {
    onMessage?.('GraphQL chưa trả đủ danh sách nhóm, giữ nguyên dữ liệu nhóm hiện có.');
  }

  return {
    groups: Array.from(state.collected.values()),
    scanComplete,
    expectedCount: state.expectedCount,
    source: 'graphql',
  };
}

async function fetchGraphqlPageInTab(
  tabId: number,
  requestUrl: string,
  postData: string,
  headers: Record<string, string>,
) {
  const results = await chrome.scripting?.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: fetchGraphqlPageInFacebookPage,
    args: [requestUrl, postData, headers],
  });
  const result = results?.[0]?.result;
  if (!result) throw new Error('Không nhận được response GraphQL từ tab Facebook.');
  return result;
}

async function fetchGraphqlPageWithRetry(
  tabId: number,
  requestUrl: string,
  postData: string,
  headers: Record<string, string>,
  onMessage?: (message: string) => void,
) {
  let lastResponse: FacebookGraphqlFetchResult | null = null;

  for (let attempt = 0; attempt <= GRAPHQL_RETRY_DELAYS_MS.length; attempt += 1) {
    if (attempt > 0) {
      const delay = GRAPHQL_RETRY_DELAYS_MS[attempt - 1]
        ?? GRAPHQL_RETRY_DELAYS_MS[GRAPHQL_RETRY_DELAYS_MS.length - 1];
      await sleep(delay);
      onMessage?.(`Facebook GraphQL temporary failure, retry ${attempt}/${GRAPHQL_RETRY_DELAYS_MS.length}...`);
    }

    const response = await fetchGraphqlPageInTab(tabId, requestUrl, postData, headers);
    lastResponse = response;
    if (!isRetryableGraphqlFailure(response.status, response.body) || attempt >= GRAPHQL_RETRY_DELAYS_MS.length) {
      return response;
    }
  }

  if (lastResponse) return lastResponse;
  throw new Error('Facebook GraphQL page request failed after retries.');
}

function isRetryableGraphqlFailure(status: number, body: string) {
  if (status === 429 || status >= 500) return true;
  const normalizedBody = body.toLowerCase();
  return normalizedBody.includes('internal_server_error')
    || normalizedBody.includes('request could not be completed')
    || normalizedBody.includes('please retry later')
    || normalizedBody.includes('temporarily unavailable');
}

interface FacebookGroupsScrollResult {
  target: string;
  steps: number;
}

async function nudgeFacebookGroupsPagination(tabId: number): Promise<FacebookGroupsScrollResult> {
  const results = await chrome.scripting?.executeScript<[], FacebookGroupsScrollResult>({
    target: { tabId },
    world: 'MAIN',
    func: scrollFacebookGroupsPageForPagination,
  });
  const result = results?.[0]?.result;
  if (!result) throw new Error('Không xác định được container scroll danh sách nhóm Facebook.');
  return result;
}

async function readFacebookPageRuntimeState(tabId: number): Promise<FacebookPageRuntimeState | null> {
  const results = await chrome.scripting?.executeScript<[], FacebookPageRuntimeState>({
    target: { tabId },
    world: 'MAIN',
    func: getFacebookPageRuntimeState,
  });
  return results?.[0]?.result ?? null;
}

function getFacebookPageRuntimeState(): FacebookPageRuntimeState {
  return {
    visibilityState: document.visibilityState,
    hidden: document.hidden,
    readyState: document.readyState,
    hasFocus: document.hasFocus(),
  };
}

async function fetchGraphqlPageInFacebookPage(
  requestUrl: string,
  postData: string,
  headers: Record<string, string>,
): Promise<FacebookGraphqlFetchResult> {
  const response = await fetch(requestUrl, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: postData,
  });
  return {
    status: response.status,
    body: await response.text(),
  };
}

async function scrollFacebookGroupsPageForPagination(): Promise<FacebookGroupsScrollResult> {
  const sleepMs = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
  const documentScroller = document.scrollingElement as HTMLElement | null;
  const isDocumentScroller = (element: HTMLElement) => (
    element === documentScroller
    || element === document.documentElement
    || element === document.body
  );
  const isVisible = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const isScrollable = (element: HTMLElement) => (
    element.scrollHeight > element.clientHeight + 40
    && (isDocumentScroller(element) || isVisible(element))
  );
  const countGroupLinks = (element: HTMLElement) => element.querySelectorAll<HTMLAnchorElement>(
    'a[href*="/groups/"]',
  ).length;
  const candidates: HTMLElement[] = [];
  const addCandidate = (element: HTMLElement | null) => {
    if (!element || candidates.includes(element) || !isScrollable(element)) return;
    candidates.push(element);
  };

  addCandidate(documentScroller);
  addCandidate(document.documentElement);
  addCandidate(document.body);
  addCandidate(document.querySelector<HTMLElement>('[role="main"]'));
  addCandidate(document.querySelector<HTMLElement>('[role="feed"]'));

  // The joined-group cards can live inside a nested scroller. Walk upward from
  // a real group link so the sidebar and the main grid are not scrolled together.
  for (const anchor of Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/groups/"]'))) {
    let current: HTMLElement | null = anchor.parentElement;
    for (let depth = 0; current && depth < 12; depth += 1) {
      addCandidate(current);
      current = current.parentElement;
    }
  }

  const target = candidates
    .map((element) => {
      const rect = element.getBoundingClientRect();
      const role = element.getAttribute('role');
      const groupLinks = countGroupLinks(element);
      const maxScroll = Math.max(0, element.scrollHeight - element.clientHeight);
      const mainBonus = role === 'main' || role === 'feed' ? 50_000 : 0;
      const narrowPenalty = rect.width < 420 ? 15_000 : 0;
      return {
        element,
        groupLinks,
        maxScroll,
        score: mainBonus + groupLinks * 1_000 + Math.min(maxScroll, 20_000) - narrowPenalty,
      };
    })
    .sort((left, right) => right.score - left.score)[0]?.element
    ?? documentScroller
    ?? document.documentElement;

  const targetLabel = target === documentScroller || target === document.documentElement || target === document.body
    ? 'document'
    : `${target.getAttribute('role') ?? target.tagName.toLowerCase()}:${countGroupLinks(target)}-group-links`;
  const initialHeight = Math.max(target.scrollHeight, target.clientHeight);
  const initialViewport = Math.max(320, target.clientHeight);
  const steps = Math.min(24, Math.max(6, Math.ceil(initialHeight / (initialViewport * 0.7))));

  for (let step = 1; step <= steps; step += 1) {
    const maxScroll = Math.max(0, target.scrollHeight - target.clientHeight);
    const nextTop = Math.min(maxScroll, Math.round((maxScroll * step) / steps));
    if (isDocumentScroller(target)) {
      window.scrollTo({ top: nextTop, behavior: 'auto' });
      window.dispatchEvent(new Event('scroll'));
    } else {
      target.scrollTo({ top: nextTop, behavior: 'auto' });
      target.dispatchEvent(new Event('scroll', { bubbles: true }));
    }
    await sleepMs(550);
  }

  // A final pass accounts for a list whose height increased during lazy-load.
  const finalMaxScroll = Math.max(0, target.scrollHeight - target.clientHeight);
  if (isDocumentScroller(target)) {
    window.scrollTo({ top: finalMaxScroll, behavior: 'auto' });
    window.dispatchEvent(new Event('scroll'));
  } else {
    target.scrollTo({ top: finalMaxScroll, behavior: 'auto' });
    target.dispatchEvent(new Event('scroll', { bubbles: true }));
  }

  return { target: targetLabel, steps };
}

async function waitForInitialGroupResponse(
  responses: CapturedGraphqlResponse[],
  timeoutMs: number,
  diagnostics: GraphqlCaptureDiagnostics,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (let index = 0; index < responses.length; index += 1) {
      const response = responses[index];
      if (!isInitialRequestCursor(response.request.postData)) continue;

      responses.splice(index, 1);
      diagnostics.initialCandidateCount += 1;
      try {
        return {
          response,
          page: parseGraphqlPage(response.body),
        };
      } catch (error) {
        diagnostics.parseFailureCount += 1;
        console.warn(`[FB_GQL_PARSE_FAILED] query=${response.request.queryName || '(unknown)'}; ${toErrorMessage(error)}`);
        // Other Groups/Joined queries can be captured on the same route. Keep
        // waiting until one contains the canonical all-joined-groups connection.
      }
    }

    // Facebook may omit the root operation and expose only a pagination
    // response after lazy loading. Accept a canonical group response here;
    // the caller rewinds a non-null cursor before continuing the scan.
    for (let index = 0; index < responses.length; index += 1) {
      const response = responses[index];
      responses.splice(index, 1);
      diagnostics.initialCandidateCount += 1;
      try {
        return {
          response,
          page: parseGraphqlPage(response.body),
        };
      } catch (error) {
        diagnostics.parseFailureCount += 1;
        console.warn(`[FB_GQL_PARSE_FAILED] query=${response.request.queryName || '(unknown)'}; ${toErrorMessage(error)}`);
      }
    }
    await sleep(100);
  }
  throw new Error('Timeout khi chờ response GraphQL danh sách nhóm.');
}

async function waitForPaginationGroupResponse(
  responses: CapturedGraphqlResponse[],
  timeoutMs: number,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (let index = 0; index < responses.length; index += 1) {
      const response = responses[index];
      const requestCursor = readGraphqlCursor(response.request.postData);
      const operationLooksLikePagination = isPaginationQueryName(response.request.queryName);
      if (requestCursor === null || (!operationLooksLikePagination && requestCursor === undefined)) continue;

      responses.splice(index, 1);
      try {
        return {
          response,
          page: parseGraphqlPage(response.body),
        };
      } catch {
        // Other GraphQL requests may have a cursor but not the joined-groups connection.
      }
    }
    await sleep(100);
  }
  return null;
}

function parseGraphqlPage(body: string): GraphqlPage {
  const payload = parseJsonResponse(body);
  const payloadRecord = asRecord(payload);
  const errors = payloadRecord?.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    throw new Error('Facebook GraphQL trả về lỗi khi lấy danh sách nhóm.');
  }

  const data = asRecord(payloadRecord?.data);
  const viewer = asRecord(data?.viewer);
  const allJoinedGroups = asRecord(viewer?.all_joined_groups);
  const connection = asRecord(allJoinedGroups?.tab_groups_list);
  const edges = Array.isArray(connection?.edges) ? connection.edges : [];
  const pageInfo = asRecord(connection?.page_info);
  if (!connection || !pageInfo || !Array.isArray(connection.edges)) {
    throw new Error('Facebook GraphQL không chứa connection danh sách nhóm.');
  }

  const groups: FacebookGraphqlGroup[] = [];
  for (const edgeValue of edges) {
    const edge = asRecord(edgeValue);
    const node = asRecord(edge?.node);
    const externalId = asString(node?.id);
    const name = asString(node?.name)?.trim();
    const targetUrl = normalizeGroupUrl(asString(node?.url), externalId);
    if (!externalId || !name || !targetUrl) continue;
    groups.push({ targetName: name, targetUrl, targetExternalId: externalId });
  }

  const totalCount = firstNumber(
    allJoinedGroups?.total_joined_groups,
    connection?.total_joined_groups,
    data?.total_joined_groups,
  );
  return {
    groups,
    endCursor: asString(pageInfo.end_cursor),
    hasNextPage: pageInfo.has_next_page === true,
    totalCount,
  };
}

function createFallbackPaginationTemplate(initialRequest: CapturedGraphqlRequest) {
  const params = new URLSearchParams(initialRequest.postData);
  const rawVariables = params.get('variables');
  let variables: Record<string, unknown> = {};
  if (rawVariables) {
    try {
      const parsed = JSON.parse(rawVariables) as unknown;
      variables = asRecord(parsed) ?? {};
    } catch {
      variables = {};
    }
  }
  params.set('fb_api_req_friendly_name', PAGINATION_QUERY_NAME);
  params.set('doc_id', FALLBACK_PAGINATION_DOC_ID);
  params.set('variables', JSON.stringify({
    ...variables,
    count: typeof variables.count === 'number' ? variables.count : DEFAULT_PAGE_SIZE,
    cursor: null,
    ordering: Array.isArray(variables.ordering) ? variables.ordering : ['integrity_signals'],
    scale: typeof variables.scale === 'number' ? variables.scale : 1,
  }));
  return {
    ...initialRequest,
    postData: params.toString(),
    queryName: PAGINATION_QUERY_NAME,
  };
}

function updateGraphqlVariables(postData: string, cursor: string | null) {
  const params = new URLSearchParams(postData);
  const rawVariables = params.get('variables');
  if (!rawVariables) throw new Error('Request GraphQL không có variables.');
  const parsed = JSON.parse(rawVariables) as unknown;
  const variables = asRecord(parsed);
  if (!variables) throw new Error('Request GraphQL variables không hợp lệ.');
  params.set('variables', JSON.stringify({ ...variables, cursor }));
  return params.toString();
}

function mergeGroups(target: Map<string, FacebookGraphqlGroup>, groups: FacebookGraphqlGroup[]) {
  for (const group of groups) {
    if (!target.has(group.targetExternalId)) target.set(group.targetExternalId, group);
  }
}

function readQueryName(postData: string, headers: Record<string, string>) {
  const headerName = headers['x-fb-friendly-name'];
  if (headerName) return headerName;
  return new URLSearchParams(postData).get('fb_api_req_friendly_name');
}

function isPaginationQueryName(queryName: string) {
  return queryName === PAGINATION_QUERY_NAME || /AllJoinedGroups.*PaginationQuery/i.test(queryName);
}

function isPotentialGroupQueryName(queryName: string) {
  return queryName === INITIAL_QUERY_NAME
    || queryName === PAGINATION_QUERY_NAME
    || /GroupsComet.*(?:Joined|Joins)/i.test(queryName);
}

function isInitialRequestCursor(postData: string) {
  const cursor = readGraphqlCursor(postData);
  return cursor === null || cursor === undefined || cursor === '';
}

function readGraphqlCursor(postData: string): string | null | undefined {
  const rawVariables = new URLSearchParams(postData).get('variables');
  if (!rawVariables) return undefined;
  try {
    const variables = asRecord(JSON.parse(rawVariables) as unknown);
    if (!variables || !Object.prototype.hasOwnProperty.call(variables, 'cursor')) return undefined;
    return asString(variables.cursor);
  } catch {
    return undefined;
  }
}

function isFacebookGraphqlUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'www.facebook.com' && parsed.pathname === FACEBOOK_GRAPHQL_PATH;
  } catch {
    return false;
  }
}

function normalizeHeaders(headers?: Record<string, unknown>) {
  const result: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded' };
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (typeof value !== 'string') continue;
    const normalizedKey = key.toLowerCase();
    if (normalizedKey === 'x-fb-friendly-name' || normalizedKey === 'x-fb-lsd' || normalizedKey === 'x-asbd-id') {
      result[normalizedKey] = value;
    }
  }
  return result;
}

function assertRequestBelongsToAccount(postData: string, expectedFacebookExternalId: string) {
  const params = new URLSearchParams(postData);
  const requestAccountId = params.get('__user') ?? params.get('av');
  if (requestAccountId && requestAccountId !== expectedFacebookExternalId) {
    throw new Error('Response Facebook không thuộc account đang được chọn.');
  }
}

function parseJsonResponse(body: string): unknown {
  const trimmed = body.trim().replace(/^(?:for\s*\(;;\);|while\s*\(1\);|\)]}\s*['"]?\s*;?)/, '');
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const firstObjectIndex = trimmed.indexOf('{');
    if (firstObjectIndex < 0) throw new Error('Response Facebook GraphQL không phải JSON.');
    return JSON.parse(trimmed.slice(firstObjectIndex)) as unknown;
  }
}

function normalizeGroupUrl(value: string | null, externalId: string | null) {
  if (value?.startsWith('https://www.facebook.com/groups/')) return value;
  if (externalId) return `https://www.facebook.com/groups/${externalId}/`;
  return null;
}

function formatProgress(collected: number, _expected: number | null, _page: number) {
  return `Đã quét được ${collected} nhóm.`;
}

async function waitForFacebookTabComplete(tabId: number, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const tab = chrome.tabs ? await chrome.tabs.get(tabId).catch(() => null) : null;
    if (!tab) throw new Error('Tab Facebook đã bị đóng trong lúc quét danh sách nhóm.');
    if (tab.status === 'complete') return;
    await sleep(350);
  }
  throw new Error('Timeout khi chờ trang Facebook tải xong.');
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Lỗi không xác định.';
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createDiagnostics(): GraphqlCaptureDiagnostics {
  return {
    phase: 'INIT',
    tabUrl: null,
    tabStatus: null,
    tabActive: null,
    scrollTarget: null,
    requestCount: 0,
    candidateRequestCount: 0,
    responseReceivedCount: 0,
    loadingFinishedCount: 0,
    responseBodySuccessCount: 0,
    responseBodyFailureCount: 0,
    initialCandidateCount: 0,
    parseFailureCount: 0,
    focusEmulationSupported: null,
    focusEmulationEnabled: false,
    lifecycleStateActive: null,
    visibilityState: null,
    documentHidden: null,
    temporaryActivationUsed: false,
    queryNames: new Set<string>(),
    lastBodyFailure: null,
  };
}

function formatDiagnostics(diagnostics: GraphqlCaptureDiagnostics) {
  const queryNames = Array.from(diagnostics.queryNames).slice(0, 12).join('|') || '(none)';
  const lastBodyFailure = diagnostics.lastBodyFailure
    ? `, lastBodyFailure=${diagnostics.lastBodyFailure}`
    : '';
  return [
    `tabUrl=${diagnostics.tabUrl ?? '(unknown)'}`,
    `tabStatus=${diagnostics.tabStatus ?? '(unknown)'}`,
    `tabActive=${diagnostics.tabActive === null ? '(unknown)' : String(diagnostics.tabActive)}`,
    `scrollTarget=${diagnostics.scrollTarget ?? '(not-run)'}`,
    `requests=${diagnostics.requestCount}`,
    `candidates=${diagnostics.candidateRequestCount}`,
    `responses=${diagnostics.responseReceivedCount}`,
    `finished=${diagnostics.loadingFinishedCount}`,
    `bodyOk=${diagnostics.responseBodySuccessCount}`,
    `bodyFailed=${diagnostics.responseBodyFailureCount}`,
    `initialCandidates=${diagnostics.initialCandidateCount}`,
    `parseFailed=${diagnostics.parseFailureCount}`,
    `focusSupported=${diagnostics.focusEmulationSupported === null ? '(unknown)' : String(diagnostics.focusEmulationSupported)}`,
    `focusEnabled=${String(diagnostics.focusEmulationEnabled)}`,
    `lifecycleActive=${diagnostics.lifecycleStateActive === null ? '(unknown)' : String(diagnostics.lifecycleStateActive)}`,
    `visibility=${diagnostics.visibilityState ?? '(unknown)'}`,
    `hidden=${diagnostics.documentHidden === null ? '(unknown)' : String(diagnostics.documentHidden)}`,
    `temporaryActivation=${String(diagnostics.temporaryActivationUsed)}`,
    `queries=${queryNames}`,
    lastBodyFailure,
  ].filter(Boolean).join(', ');
}
