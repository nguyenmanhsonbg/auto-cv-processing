import type { FacebookPublishPlan } from './types';

const FRONTEND_SOURCE = 'vcs-recruitment-frontend';
const EXTENSION_SOURCE = 'vcs-recruitment-extension';
const AUTH_CHECK_REQUEST = 'VCS_FRONTEND_FACEBOOK_AUTH_CHECK_REQUEST';
const PUBLISH_REQUEST = 'VCS_FRONTEND_FACEBOOK_PUBLISH_REQUEST';
const BRIDGE_RESPONSE = 'VCS_FRONTEND_FACEBOOK_BRIDGE_RESPONSE';
const BACKGROUND_AUTH_CHECK_REQUEST = 'FRONTEND_FACEBOOK_AUTH_CHECK_REQUEST';
const BACKGROUND_PUBLISH_REQUEST = 'FRONTEND_FACEBOOK_PUBLISH_REQUEST';
const BACKGROUND_EVENT = 'FRONTEND_FACEBOOK_EVENT';
const BACKGROUND_PORT = 'frontend-facebook-publish';

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
  }
});

chrome.runtime?.onMessage.addListener((message) => {
  if (!isBackgroundEvent(message)) return;
  postToPage(message.requestId, message.event, message.payload);
});

function sendBackgroundPortRequest(message: {
  type: typeof BACKGROUND_AUTH_CHECK_REQUEST | typeof BACKGROUND_PUBLISH_REQUEST;
  requestId: string;
  accessToken?: string;
  plan?: FacebookPublishPlan;
}) {
  const port = chrome.runtime?.connect?.({ name: BACKGROUND_PORT });
  if (!port) {
    postToPage(message.requestId, 'ERROR', {
      message: 'Extension runtime port is not available.',
    });
    return;
  }

  let terminalEventReceived = false;

  port.onMessage.addListener((event: unknown) => {
    if (!isBackgroundEvent(event)) return;
    postToPage(event.requestId, event.event, event.payload);

    if (event.requestId === message.requestId && isTerminalEvent(event.event)) {
      terminalEventReceived = true;
      try {
        port.disconnect();
      } catch {
        // The background may already have closed the port after sending the terminal event.
      }
    }
  });

  port.onDisconnect.addListener(() => {
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
