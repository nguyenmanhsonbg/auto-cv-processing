import { appendAmisDiagnostic } from './amis-diagnostics-store';
import { AMIS_SAVE_RECRUITMENT_PATH, isAmisSaveRecruitmentUrl, mapAmisSaveRecruitmentResponse } from './amis-api-mapper';
import type { AmisExtractionResult } from './types';

const DEBUGGER_PROTOCOL_VERSION = '1.3';

type CaptureHandler = (capture: AmisExtractionResult, sender: ChromeMessageSender) => void | Promise<void>;

interface PendingSaveRequest {
  tabId: number;
  requestUrl: string;
  pageUrl: string;
}

interface NetworkResponseReceivedParams {
  requestId?: string;
  response?: {
    url?: string;
    status?: number;
    mimeType?: string;
  };
}

interface NetworkLoadingFinishedParams {
  requestId?: string;
}

interface NetworkGetResponseBodyResult {
  body?: string;
  base64Encoded?: boolean;
}

const attachedTabs = new Set<number>();
const pendingSaveRequests = new Map<string, PendingSaveRequest>();
const tabPageUrls = new Map<number, string>();
let captureHandler: CaptureHandler | null = null;
let listenersInstalled = false;

export function installAmisDebuggerCapture(handler: CaptureHandler) {
  captureHandler = handler;
  if (listenersInstalled) return;
  listenersInstalled = true;

  chrome.debugger?.onEvent.addListener((source, method, params) => {
    void handleDebuggerEvent(source, method, params);
  });

  chrome.debugger?.onDetach.addListener((source, reason) => {
    const tabId = source.tabId;
    if (tabId === undefined) return;

    attachedTabs.delete(tabId);
    removePendingRequestsForTab(tabId);
    void appendAmisDiagnostic({
      type: 'DEBUGGER_DETACHED',
      pageUrl: tabPageUrls.get(tabId) ?? '',
      timestamp: new Date().toISOString(),
      details: { reason },
    });
  });
}

export async function ensureAmisDebuggerAttached(tab: ChromeMessageSender['tab'], pageUrl?: string) {
  const tabId = tab?.id;
  if (tabId === undefined) return;

  const effectivePageUrl = pageUrl ?? tab?.url ?? '';
  if (!isAmisPageUrl(effectivePageUrl)) return;

  tabPageUrls.set(tabId, effectivePageUrl);
  if (attachedTabs.has(tabId)) return;

  if (!chrome.debugger) {
    await appendAmisDiagnostic({
      type: 'DEBUGGER_ATTACH_FAILED',
      pageUrl: effectivePageUrl,
      timestamp: new Date().toISOString(),
      details: { message: 'chrome.debugger API is unavailable.' },
    });
    return;
  }

  try {
    await debuggerAttach({ tabId }, DEBUGGER_PROTOCOL_VERSION);
    attachedTabs.add(tabId);
    await debuggerSendCommand({ tabId }, 'Network.enable', {});

    await appendAmisDiagnostic({
      type: 'DEBUGGER_ATTACHED',
      pageUrl: effectivePageUrl,
      timestamp: new Date().toISOString(),
      details: {
        protocolVersion: DEBUGGER_PROTOCOL_VERSION,
        watchedPath: AMIS_SAVE_RECRUITMENT_PATH,
      },
    });
  } catch (error) {
    attachedTabs.delete(tabId);
    await appendAmisDiagnostic({
      type: 'DEBUGGER_ATTACH_FAILED',
      pageUrl: effectivePageUrl,
      timestamp: new Date().toISOString(),
      details: { message: toErrorMessage(error) },
    });
  }
}

async function handleDebuggerEvent(
  source: ChromeDebuggee,
  method: string,
  params?: Record<string, unknown>,
) {
  const tabId = source.tabId;
  if (tabId === undefined) return;

  if (method === 'Network.responseReceived') {
    handleResponseReceived(tabId, params as NetworkResponseReceivedParams | undefined);
    return;
  }

  if (method === 'Network.loadingFinished') {
    await handleLoadingFinished(tabId, params as NetworkLoadingFinishedParams | undefined);
  }
}

function handleResponseReceived(tabId: number, params?: NetworkResponseReceivedParams) {
  const requestId = params?.requestId;
  const requestUrl = params?.response?.url;
  if (!requestId || !requestUrl || !isAmisSaveRecruitmentUrl(requestUrl)) return;

  const pageUrl = tabPageUrls.get(tabId) ?? requestUrl;
  pendingSaveRequests.set(requestId, {
    tabId,
    requestUrl,
    pageUrl,
  });

  void appendAmisDiagnostic({
    type: 'DEBUGGER_SAVE_RESPONSE_SEEN',
    pageUrl,
    timestamp: new Date().toISOString(),
    requestUrl,
    details: {
      status: params.response?.status,
      mimeType: params.response?.mimeType,
    },
  });
}

async function handleLoadingFinished(tabId: number, params?: NetworkLoadingFinishedParams) {
  const requestId = params?.requestId;
  if (!requestId) return;

  const pending = pendingSaveRequests.get(requestId);
  if (!pending || pending.tabId !== tabId) return;
  pendingSaveRequests.delete(requestId);

  try {
    const responseBody = await debuggerSendCommand<NetworkGetResponseBodyResult>(
      { tabId },
      'Network.getResponseBody',
      { requestId },
    );
    const bodyText = decodeResponseBody(responseBody);
    const responseJson = parseJsonText(bodyText);
    const capture = mapAmisSaveRecruitmentResponse(
      responseJson,
      pending.requestUrl,
      pending.pageUrl,
    );

    if (!capture) {
      await appendAmisDiagnostic({
        type: 'SAVE_RESPONSE_UNMAPPED',
        pageUrl: pending.pageUrl,
        timestamp: new Date().toISOString(),
        requestUrl: pending.requestUrl,
        details: describePayloadShape(responseJson),
      });
      return;
    }

    await appendAmisDiagnostic({
      type: 'CAPTURE_PUBLISHED',
      pageUrl: pending.pageUrl,
      timestamp: new Date().toISOString(),
      requestUrl: pending.requestUrl,
      details: {
        source: 'debugger',
        confidence: capture.confidence,
        missingFields: capture.missingFields,
        hasSnapshot: Boolean(capture.snapshot),
        hasAmisRecruitmentId: Boolean(capture.amisRecruitmentId),
      },
    });

    await captureHandler?.(capture, {
      tab: {
        id: tabId,
        url: pending.pageUrl,
      },
    });
  } catch (error) {
    await appendAmisDiagnostic({
      type: 'DEBUGGER_GET_BODY_FAILED',
      pageUrl: pending.pageUrl,
      timestamp: new Date().toISOString(),
      requestUrl: pending.requestUrl,
      details: { message: toErrorMessage(error) },
    });
  }
}

function removePendingRequestsForTab(tabId: number) {
  for (const [requestId, request] of pendingSaveRequests.entries()) {
    if (request.tabId === tabId) pendingSaveRequests.delete(requestId);
  }
}

function decodeResponseBody(result: NetworkGetResponseBodyResult) {
  const body = result.body ?? '';
  if (!result.base64Encoded) return body;

  const binary = globalThis.atob(body);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function parseJsonText(text: string) {
  const cleaned = text
    .trim()
    .replace(/^\uFEFF/, '')
    .replace(/^\)\]\}',?\s*/, '');
  if (!cleaned) return null;

  return JSON.parse(cleaned) as unknown;
}

function describePayloadShape(value: unknown) {
  if (typeof value !== 'object' || value === null) {
    return { responseType: typeof value };
  }

  const data = (value as { Data?: unknown; data?: unknown }).Data ?? (value as { data?: unknown }).data;
  const dataObject = typeof data === 'object' && data !== null ? data : null;

  return {
    topLevelKeys: Object.keys(value).slice(0, 20),
    success: (value as { Success?: unknown; success?: unknown }).Success
      ?? (value as { success?: unknown }).success,
    hasData: Boolean(data),
    dataKeys: dataObject ? Object.keys(dataObject).slice(0, 30) : [],
  };
}

function isAmisPageUrl(url: string) {
  try {
    return new URL(url).hostname === 'amisapp.misa.vn';
  } catch {
    return false;
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

function toErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return 'Unknown debugger error.';
}
