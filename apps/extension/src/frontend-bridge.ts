import type { FacebookPublishPlan, FacebookPublishTarget } from './types';

const FRONTEND_SOURCE = 'vcs-recruitment-frontend';
const EXTENSION_SOURCE = 'vcs-recruitment-extension';
const AUTH_CHECK_REQUEST = 'VCS_FRONTEND_FACEBOOK_AUTH_CHECK_REQUEST';
const PUBLISH_REQUEST = 'VCS_FRONTEND_FACEBOOK_PUBLISH_REQUEST';
const GROUP_VERIFY_REQUEST = 'VCS_FRONTEND_FACEBOOK_GROUP_VERIFY_REQUEST';
const BRIDGE_RESPONSE = 'VCS_FRONTEND_FACEBOOK_BRIDGE_RESPONSE';
const IMAGE_ATTACH_DECISION = 'VCS_FRONTEND_FACEBOOK_IMAGE_ATTACH_DECISION';
const BACKGROUND_AUTH_CHECK_REQUEST = 'FRONTEND_FACEBOOK_AUTH_CHECK_REQUEST';
const BACKGROUND_PUBLISH_REQUEST = 'FRONTEND_FACEBOOK_PUBLISH_REQUEST';
const BACKGROUND_GROUP_VERIFY_REQUEST = 'FRONTEND_FACEBOOK_GROUP_VERIFY_REQUEST';
const BACKGROUND_EVENT = 'FRONTEND_FACEBOOK_EVENT';
const BACKGROUND_PORT = 'frontend-facebook-publish';
const EXPORT_AI_MATCH_PREVIEW_PDF_MESSAGE = 'VCS_EXPORT_AI_MATCH_PREVIEW_PDF';
const EXPORT_AI_MATCH_PREVIEW_PDF_FROM_PAGE = 'VCS_EXPORT_AI_MATCH_PREVIEW_PDF_FROM_PAGE';
const EXPORT_AI_MATCH_PREVIEW_PDF_RESULT = 'VCS_EXPORT_AI_MATCH_PREVIEW_PDF_RESULT';

const activeRequestPorts = new Map<string, ChromePort>();

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (event.origin !== window.location.origin) return;

  if (isAuthCheckRequest(event.data)) {
    sendBackgroundPortRequest({
      type: BACKGROUND_AUTH_CHECK_REQUEST,
      requestId: event.data.requestId,
    });
    return;
  }

  if (isPublishRequest(event.data)) {
    sendBackgroundPortRequest({
      type: BACKGROUND_PUBLISH_REQUEST,
      requestId: event.data.requestId,
      accessToken: event.data.payload.accessToken,
      plan: event.data.payload.plan,
    });
    return;
  }

  if (isGroupVerifyRequest(event.data)) {
    sendBackgroundPortRequest({
      type: BACKGROUND_GROUP_VERIFY_REQUEST,
      requestId: event.data.requestId,
      target: event.data.payload.target,
    });
    return;
  }

  if (isImageAttachDecisionMessage(event.data)) {
    const port = activeRequestPorts.get(event.data.requestId);
    if (!port) return;
    port.postMessage({
      type: IMAGE_ATTACH_DECISION,
      requestId: event.data.requestId,
      decision: event.data.payload.decision,
    });
  }
});

chrome.runtime?.onMessage.addListener((message) => {
  if (isExportAiMatchPreviewPdfRequest(message)) {
    void requestVectorAiMatchPreviewPdf(message.applicationId)
      .then((dataBase64) => chrome.runtime?.sendMessage?.({
        type: 'VCS_EXPORT_AI_MATCH_PREVIEW_PDF_RESULT',
        requestId: message.requestId,
        ok: true,
        dataBase64,
      }))
      .catch((error: unknown) => chrome.runtime?.sendMessage?.({
        type: 'VCS_EXPORT_AI_MATCH_PREVIEW_PDF_RESULT',
        requestId: message.requestId,
        ok: false,
        error: error instanceof Error ? error.message : 'Could not export AI Match Preview PDF.',
      }));
    return;
  }
  if (!isBackgroundEvent(message)) return;
  postToPage(message.requestId, message.event, message.payload);
});

function requestVectorAiMatchPreviewPdf(applicationId: string) {
  return new Promise<string>((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const timeoutId = window.setTimeout(() => {
      window.removeEventListener('message', handleResponse);
      reject(new Error('Timed out while creating AI Match Preview PDF.'));
    }, 60_000);
    const handleResponse = (event: MessageEvent<unknown>) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      if (typeof event.data !== 'object' || event.data === null) return;
      const response = event.data as { source?: unknown; type?: unknown; requestId?: unknown; ok?: unknown; dataBase64?: unknown; error?: unknown };
      if (response.source !== 'vcs-recruitment-frontend' || response.type !== EXPORT_AI_MATCH_PREVIEW_PDF_RESULT || response.requestId !== requestId) return;
      window.clearTimeout(timeoutId);
      window.removeEventListener('message', handleResponse);
      if (response.ok && typeof response.dataBase64 === 'string') {
        resolve(response.dataBase64);
      } else {
        reject(new Error(typeof response.error === 'string' ? response.error : 'Could not create AI Match Preview PDF.'));
      }
    };
    window.addEventListener('message', handleResponse);
    window.postMessage({
      source: EXTENSION_SOURCE,
      type: EXPORT_AI_MATCH_PREVIEW_PDF_FROM_PAGE,
      requestId,
      applicationId,
    }, window.location.origin);
  });
}

function isExportAiMatchPreviewPdfRequest(value: unknown): value is { type: string; requestId: string; applicationId: string } {
  return typeof value === 'object'
    && value !== null
    && (value as { type?: unknown }).type === EXPORT_AI_MATCH_PREVIEW_PDF_MESSAGE
    && typeof (value as { requestId?: unknown }).requestId === 'string'
    && typeof (value as { applicationId?: unknown }).applicationId === 'string';
}

function sendBackgroundPortRequest(message: {
  type: typeof BACKGROUND_AUTH_CHECK_REQUEST | typeof BACKGROUND_PUBLISH_REQUEST | typeof BACKGROUND_GROUP_VERIFY_REQUEST;
  requestId: string;
  accessToken?: string;
  plan?: FacebookPublishPlan;
  target?: FacebookPublishTarget;
}) {
  const port = chrome.runtime?.connect?.({ name: BACKGROUND_PORT });
  if (!port) {
    postToPage(message.requestId, 'ERROR', {
      message: 'Extension runtime port is not available.',
    });
    return;
  }

  let terminalEventReceived = false;
  activeRequestPorts.set(message.requestId, port);

  port.onMessage.addListener((event: unknown) => {
    if (!isBackgroundEvent(event)) return;
    postToPage(event.requestId, event.event, event.payload);

    if (event.requestId === message.requestId && isTerminalEvent(event.event)) {
      terminalEventReceived = true;
      activeRequestPorts.delete(message.requestId);
      try {
        port.disconnect();
      } catch {
        // The background may already have closed the port after sending the terminal event.
      }
    }
  });

  port.onDisconnect.addListener(() => {
    activeRequestPorts.delete(message.requestId);
    if (terminalEventReceived) return;
    postToPage(message.requestId, 'ERROR', {
      message: chrome.runtime?.lastError?.message
        ?? 'Extension background connection closed before Facebook publishing completed.',
    });
  });

  try {
    port.postMessage(message);
  } catch (error) {
    postToPage(message.requestId, 'ERROR', {
      message: error instanceof Error ? error.message : 'Extension bridge request failed.',
    });
    try {
      port.disconnect();
    } catch {
      // Ignore disconnect errors after a failed postMessage.
    }
  }
}

function postToPage(requestId: string, event: string, payload?: unknown) {
  window.postMessage({
    source: EXTENSION_SOURCE,
    type: BRIDGE_RESPONSE,
    requestId,
    event,
    payload,
  }, window.location.origin);
}

function isAuthCheckRequest(value: unknown): value is {
  source: typeof FRONTEND_SOURCE;
  type: typeof AUTH_CHECK_REQUEST;
  requestId: string;
} {
  return typeof value === 'object'
    && value !== null
    && (value as { source?: unknown }).source === FRONTEND_SOURCE
    && (value as { type?: unknown }).type === AUTH_CHECK_REQUEST
    && typeof (value as { requestId?: unknown }).requestId === 'string';
}

function isPublishRequest(value: unknown): value is {
  source: typeof FRONTEND_SOURCE;
  type: typeof PUBLISH_REQUEST;
  requestId: string;
  payload: {
    accessToken: string;
    plan: FacebookPublishPlan;
  };
} {
  const payload = (value as { payload?: { accessToken?: unknown; plan?: unknown } } | null)?.payload;
  return typeof value === 'object'
    && value !== null
    && (value as { source?: unknown }).source === FRONTEND_SOURCE
    && (value as { type?: unknown }).type === PUBLISH_REQUEST
    && typeof (value as { requestId?: unknown }).requestId === 'string'
    && typeof payload?.accessToken === 'string'
    && isFacebookPublishPlan(payload.plan);
}

function isGroupVerifyRequest(value: unknown): value is {
  source: typeof FRONTEND_SOURCE;
  type: typeof GROUP_VERIFY_REQUEST;
  requestId: string;
  payload: {
    target: FacebookPublishTarget;
  };
} {
  const payload = (value as { payload?: { target?: unknown } } | null)?.payload;
  return typeof value === 'object'
    && value !== null
    && (value as { source?: unknown }).source === FRONTEND_SOURCE
    && (value as { type?: unknown }).type === GROUP_VERIFY_REQUEST
    && typeof (value as { requestId?: unknown }).requestId === 'string'
    && isFacebookPublishTarget(payload?.target);
}

function isImageAttachDecisionMessage(value: unknown): value is {
  source: typeof FRONTEND_SOURCE;
  type: typeof IMAGE_ATTACH_DECISION;
  requestId: string;
  payload: {
    decision: 'SKIP' | 'POST_TEXT_ONLY';
  };
} {
  const payload = (value as { payload?: { decision?: unknown } } | null)?.payload;
  return typeof value === 'object'
    && value !== null
    && (value as { source?: unknown }).source === FRONTEND_SOURCE
    && (value as { type?: unknown }).type === IMAGE_ATTACH_DECISION
    && typeof (value as { requestId?: unknown }).requestId === 'string'
    && (payload?.decision === 'SKIP' || payload?.decision === 'POST_TEXT_ONLY');
}

function isBackgroundEvent(value: unknown): value is {
  type: typeof BACKGROUND_EVENT;
  requestId: string;
  event: string;
  payload?: unknown;
} {
  return typeof value === 'object'
    && value !== null
    && (value as { type?: unknown }).type === BACKGROUND_EVENT
    && typeof (value as { requestId?: unknown }).requestId === 'string'
    && typeof (value as { event?: unknown }).event === 'string';
}

function isTerminalEvent(event: string) {
  return event === 'COMPLETED' || event === 'ERROR';
}

function isFacebookPublishPlan(value: unknown): value is FacebookPublishPlan {
  return typeof value === 'object'
    && value !== null
    && typeof (value as { jobPostingId?: unknown }).jobPostingId === 'string'
    && typeof (value as { content?: unknown }).content === 'string'
    && Array.isArray((value as { targets?: unknown }).targets)
    && typeof (value as { delay?: unknown }).delay === 'object'
    && (value as { delay?: unknown }).delay !== null;
}

function isFacebookPublishTarget(value: unknown): value is FacebookPublishTarget {
  return typeof value === 'object'
    && value !== null
    && typeof (value as { targetType?: unknown }).targetType === 'string'
    && typeof (value as { targetName?: unknown }).targetName === 'string';
}
