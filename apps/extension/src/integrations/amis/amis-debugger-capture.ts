import { appendAmisDiagnostic } from '@/stores/amis-diagnostics-store';
import {
  attachChromeDebugger,
  decodeChromeDebuggerResponseBody,
  sendChromeDebuggerCommand,
} from '@/integrations/chrome-debugger-utils';
import {
  AMIS_CAREER_DATA_PAGING_PATH,
  isAmisCandidateAdditionalInfoUrl,
  isAmisCandidateUpdateRoundUrl,
  AMIS_SAVE_RECRUITMENT_PATH,
  isAmisCareerDataPagingUrl,
  mapAmisCandidateStageResponse,
  isLikelyAmisApplicationListUrl,
  isAmisSaveRecruitmentUrl,
  mapAmisApplicationsResponse,
  mapAmisCareerDataPagingResponse,
  mapAmisSaveRecruitmentResponse,
} from '@/integrations/amis/amis-api-mapper';
import type {
  AmisApplicationItem,
  AmisCandidateStageChangedPayload,
  AmisCareerItem,
  AmisExtractionResult,
} from '@/types/types';

const DEBUGGER_PROTOCOL_VERSION = '1.3';
const CANDIDATE_STAGE_TRANSITION_WINDOW_MS = 15_000;

type CaptureHandler = (capture: AmisExtractionResult, sender: ChromeMessageSender) => void | Promise<void>;
type CareerCaptureHandler = (capture: AmisCareerCapture, sender: ChromeMessageSender) => void | Promise<void>;
type ApplicationsCaptureHandler = (capture: AmisApplicationsCapture, sender: ChromeMessageSender) => void | Promise<void>;
type CandidateStageCaptureHandler = (
  capture: AmisCandidateStageChangedPayload,
  sender: ChromeMessageSender,
) => void | Promise<void>;

interface PendingSaveRequest {
  tabId: number;
  requestUrl: string;
  pageUrl: string;
}

interface PendingCareerRequest {
  tabId: number;
  requestUrl: string;
  pageUrl: string;
}

interface PendingApplicationsRequest {
  tabId: number;
  requestUrl: string;
  pageUrl: string;
}

interface PendingCandidateStageRequest {
  tabId: number;
  requestUrl: string;
  pageUrl: string;
}

export interface AmisCareerCapture {
  sourceUrl: string;
  pageUrl: string;
  items: AmisCareerItem[];
  rawCount: number;
}

export interface AmisApplicationsCapture {
  sourceUrl: string;
  pageUrl: string;
  items: AmisApplicationItem[];
  rawCount: number;
  amisRecruitmentId: string;
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
const pendingCareerRequests = new Map<string, PendingCareerRequest>();
const pendingApplicationsRequests = new Map<string, PendingApplicationsRequest>();
const pendingCandidateStageRequests = new Map<string, PendingCandidateStageRequest>();
const tabPageUrls = new Map<number, string>();
const lastCandidateRoundMutationAtByTab = new Map<number, number>();
let captureHandler: CaptureHandler | null = null;
let careerCaptureHandler: CareerCaptureHandler | null = null;
let applicationsCaptureHandler: ApplicationsCaptureHandler | null = null;
let candidateStageCaptureHandler: CandidateStageCaptureHandler | null = null;
let listenersInstalled = false;

export function installAmisDebuggerCapture(
  handler: CaptureHandler,
  careerHandler?: CareerCaptureHandler,
  applicationsHandler?: ApplicationsCaptureHandler,
  candidateStageHandler?: CandidateStageCaptureHandler,
) {
  captureHandler = handler;
  careerCaptureHandler = careerHandler ?? null;
  applicationsCaptureHandler = applicationsHandler ?? null;
  candidateStageCaptureHandler = candidateStageHandler ?? null;
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
    await attachChromeDebugger({ tabId }, DEBUGGER_PROTOCOL_VERSION);
    attachedTabs.add(tabId);
    await sendChromeDebuggerCommand({ tabId }, 'Network.enable', {});

    await appendAmisDiagnostic({
      type: 'DEBUGGER_ATTACHED',
      pageUrl: effectivePageUrl,
      timestamp: new Date().toISOString(),
      details: {
        protocolVersion: DEBUGGER_PROTOCOL_VERSION,
        watchedPaths: [AMIS_SAVE_RECRUITMENT_PATH, AMIS_CAREER_DATA_PAGING_PATH, 'AMIS candidate/application list responses'],
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
  if (!requestId || !requestUrl) return;

  const pageUrl = tabPageUrls.get(tabId) ?? requestUrl;
  if (isAmisCandidateUpdateRoundUrl(requestUrl)) {
    if ((params.response?.status ?? 0) >= 200 && (params.response?.status ?? 0) < 300) {
      lastCandidateRoundMutationAtByTab.set(tabId, Date.now());
    }
    return;
  }

  if (isAmisCandidateAdditionalInfoUrl(requestUrl)) {
    pendingCandidateStageRequests.set(requestId, {
      tabId,
      requestUrl,
      pageUrl,
    });

    void appendAmisDiagnostic({
      type: 'DEBUGGER_CANDIDATE_STAGE_RESPONSE_SEEN',
      pageUrl,
      timestamp: new Date().toISOString(),
      requestUrl,
      details: {
        status: params.response?.status,
        mimeType: params.response?.mimeType,
      },
    });
    return;
  }

  if (isAmisCareerDataPagingUrl(requestUrl)) {
    pendingCareerRequests.set(requestId, {
      tabId,
      requestUrl,
      pageUrl,
    });

    void appendAmisDiagnostic({
      type: 'DEBUGGER_CAREER_RESPONSE_SEEN',
      pageUrl,
      timestamp: new Date().toISOString(),
      requestUrl,
      details: {
        status: params.response?.status,
        mimeType: params.response?.mimeType,
      },
    });
    return;
  }

  if (isAmisSaveRecruitmentUrl(requestUrl)) {
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
    return;
  }

  if (!isLikelyAmisApplicationListUrl(requestUrl)) return;

  pendingApplicationsRequests.set(requestId, {
    tabId,
    requestUrl,
    pageUrl,
  });

  void appendAmisDiagnostic({
    type: 'DEBUGGER_APPLICATIONS_RESPONSE_SEEN',
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
  if (pending && pending.tabId === tabId) {
    pendingSaveRequests.delete(requestId);
    await handleSaveLoadingFinished(tabId, requestId, pending);
    return;
  }

  const pendingCareer = pendingCareerRequests.get(requestId);
  if (pendingCareer && pendingCareer.tabId === tabId) {
    pendingCareerRequests.delete(requestId);
    await handleCareerLoadingFinished(tabId, requestId, pendingCareer);
    return;
  }

  const pendingApplications = pendingApplicationsRequests.get(requestId);
  if (pendingApplications && pendingApplications.tabId === tabId) {
    pendingApplicationsRequests.delete(requestId);
    await handleApplicationsLoadingFinished(tabId, requestId, pendingApplications);
    return;
  }

  const pendingCandidateStage = pendingCandidateStageRequests.get(requestId);
  if (!pendingCandidateStage || pendingCandidateStage.tabId !== tabId) return;
  pendingCandidateStageRequests.delete(requestId);
  await handleCandidateStageLoadingFinished(tabId, requestId, pendingCandidateStage);
}

async function handleCandidateStageLoadingFinished(
  tabId: number,
  requestId: string,
  pending: PendingCandidateStageRequest,
) {
  try {
    const responseBody = await sendChromeDebuggerCommand<NetworkGetResponseBodyResult>(
      { tabId },
      'Network.getResponseBody',
      { requestId },
    );
    const bodyText = decodeChromeDebuggerResponseBody(responseBody);
    const responseJson = parseJsonText(bodyText);
    const capture = mapAmisCandidateStageResponse(
      responseJson,
      pending.requestUrl,
      pending.pageUrl,
    );

    if (!capture) {
      await appendAmisDiagnostic({
        type: 'CANDIDATE_STAGE_RESPONSE_UNMAPPED',
        pageUrl: pending.pageUrl,
        timestamp: new Date().toISOString(),
        requestUrl: pending.requestUrl,
        details: describePayloadShape(responseJson),
      });
      return;
    }

    const lastRoundMutationAt = lastCandidateRoundMutationAtByTab.get(tabId) ?? 0;
    const isPostTransition = Date.now() - lastRoundMutationAt <= CANDIDATE_STAGE_TRANSITION_WINDOW_MS;
    const publishedCapture = isPostTransition
      ? { ...capture, isTransitionEvent: true }
      : capture;

    await appendAmisDiagnostic({
      type: 'CANDIDATE_STAGE_CAPTURE_PUBLISHED',
      pageUrl: pending.pageUrl,
      timestamp: new Date().toISOString(),
      requestUrl: pending.requestUrl,
      details: {
        source: 'debugger',
        amisRecruitmentId: capture.amisRecruitmentId,
        amisCandidateId: capture.amisCandidateId,
        amisRecruitmentRoundId: publishedCapture.amisRecruitmentRoundId,
        amisRecruitmentRoundName: publishedCapture.amisRecruitmentRoundName,
        isTransitionEvent: publishedCapture.isTransitionEvent === true,
      },
    });

    await candidateStageCaptureHandler?.(publishedCapture, {
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
      details: { message: toErrorMessage(error), captureType: 'candidate-stage' },
    });
  }
}

async function handleSaveLoadingFinished(
  tabId: number,
  requestId: string,
  pending: PendingSaveRequest,
) {
  try {
    const responseBody = await sendChromeDebuggerCommand<NetworkGetResponseBodyResult>(
      { tabId },
      'Network.getResponseBody',
      { requestId },
    );
    const bodyText = decodeChromeDebuggerResponseBody(responseBody);
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

async function handleCareerLoadingFinished(
  tabId: number,
  requestId: string,
  pending: PendingCareerRequest,
) {
  try {
    const responseBody = await sendChromeDebuggerCommand<NetworkGetResponseBodyResult>(
      { tabId },
      'Network.getResponseBody',
      { requestId },
    );
    const bodyText = decodeChromeDebuggerResponseBody(responseBody);
    const responseJson = parseJsonText(bodyText);
    const items = mapAmisCareerDataPagingResponse(responseJson);

    if (items.length === 0) {
      await appendAmisDiagnostic({
        type: 'CAREER_RESPONSE_UNMAPPED',
        pageUrl: pending.pageUrl,
        timestamp: new Date().toISOString(),
        requestUrl: pending.requestUrl,
        details: describePayloadShape(responseJson),
      });
      return;
    }

    await appendAmisDiagnostic({
      type: 'CAREER_CAPTURE_PUBLISHED',
      pageUrl: pending.pageUrl,
      timestamp: new Date().toISOString(),
      requestUrl: pending.requestUrl,
      details: {
        source: 'debugger',
        itemCount: items.length,
        organizationUnitId: items.find((item) => item.organizationUnitId)?.organizationUnitId,
      },
    });

    await careerCaptureHandler?.({
      sourceUrl: pending.requestUrl,
      pageUrl: pending.pageUrl,
      items,
      rawCount: items.length,
    }, {
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
      details: { message: toErrorMessage(error), captureType: 'career' },
    });
  }
}

async function handleApplicationsLoadingFinished(
  tabId: number,
  requestId: string,
  pending: PendingApplicationsRequest,
) {
  try {
    const responseBody = await sendChromeDebuggerCommand<NetworkGetResponseBodyResult>(
      { tabId },
      'Network.getResponseBody',
      { requestId },
    );
    const bodyText = decodeChromeDebuggerResponseBody(responseBody);
    const responseJson = parseJsonText(bodyText);
    const items = mapAmisApplicationsResponse(responseJson);

    if (items.length === 0) {
      await appendAmisDiagnostic({
        type: 'APPLICATIONS_RESPONSE_UNMAPPED',
        pageUrl: pending.pageUrl,
        timestamp: new Date().toISOString(),
        requestUrl: pending.requestUrl,
        details: describePayloadShape(responseJson),
      });
      return;
    }

    const recruitmentIds = [...new Set(items.map((item) => item.recruitmentId))];
    if (recruitmentIds.length !== 1) {
      await appendAmisDiagnostic({
        type: 'APPLICATIONS_RESPONSE_UNMAPPED',
        pageUrl: pending.pageUrl,
        timestamp: new Date().toISOString(),
        requestUrl: pending.requestUrl,
        details: {
          reason: 'mixed-recruitment-ids',
          recruitmentIds,
        },
      });
      return;
    }

    await appendAmisDiagnostic({
      type: 'APPLICATIONS_CAPTURE_PUBLISHED',
      pageUrl: pending.pageUrl,
      timestamp: new Date().toISOString(),
      requestUrl: pending.requestUrl,
      details: {
        source: 'debugger',
        itemCount: items.length,
        amisRecruitmentId: recruitmentIds[0],
      },
    });

    await applicationsCaptureHandler?.({
      sourceUrl: pending.requestUrl,
      pageUrl: pending.pageUrl,
      items,
      rawCount: items.length,
      amisRecruitmentId: recruitmentIds[0],
    }, {
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
      details: { message: toErrorMessage(error), captureType: 'applications' },
    });
  }
}

function removePendingRequestsForTab(tabId: number) {
  for (const [requestId, request] of pendingSaveRequests.entries()) {
    if (request.tabId === tabId) pendingSaveRequests.delete(requestId);
  }

  for (const [requestId, request] of pendingCareerRequests.entries()) {
    if (request.tabId === tabId) pendingCareerRequests.delete(requestId);
  }

  for (const [requestId, request] of pendingApplicationsRequests.entries()) {
    if (request.tabId === tabId) pendingApplicationsRequests.delete(requestId);
  }

  for (const [requestId, request] of pendingCandidateStageRequests.entries()) {
    if (request.tabId === tabId) pendingCandidateStageRequests.delete(requestId);
  }

  lastCandidateRoundMutationAtByTab.delete(tabId);
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

function toErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return 'Unknown debugger error.';
}
