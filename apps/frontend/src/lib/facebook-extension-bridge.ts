import type {
  FacebookPublishPlan,
  FacebookPublishProgress,
  FacebookPublishTarget,
  VerifyFacebookGroupPayload,
} from '@/lib/recruitment-api';

const FRONTEND_SOURCE = 'vcs-recruitment-frontend';
const EXTENSION_SOURCE = 'vcs-recruitment-extension';
const AUTH_CHECK_REQUEST = 'VCS_FRONTEND_FACEBOOK_AUTH_CHECK_REQUEST';
const PUBLISH_REQUEST = 'VCS_FRONTEND_FACEBOOK_PUBLISH_REQUEST';
const GROUP_VERIFY_REQUEST = 'VCS_FRONTEND_FACEBOOK_GROUP_VERIFY_REQUEST';
const BRIDGE_RESPONSE = 'VCS_FRONTEND_FACEBOOK_BRIDGE_RESPONSE';

interface BridgeResponse {
  source: typeof EXTENSION_SOURCE;
  type: typeof BRIDGE_RESPONSE;
  requestId: string;
  event: string;
  payload?: unknown;
}

export function ensureFacebookBrowserSession() {
  return sendBridgeRequest<void>({
    type: AUTH_CHECK_REQUEST,
    timeoutMs: 10 * 60_000,
    isComplete: (event) => event === 'COMPLETED',
  });
}

export function startFacebookExtensionPublish(
  accessToken: string,
  plan: FacebookPublishPlan,
  callbacks: {
    onProgress?: (progress: FacebookPublishProgress) => void;
  } = {},
) {
  return sendBridgeRequest<void>({
    type: PUBLISH_REQUEST,
    payload: { accessToken, plan },
    timeoutMs: 30 * 60_000,
    isComplete: (event) => event === 'COMPLETED',
    onEvent: (event, payload) => {
      if (event === 'PROGRESS' && isFacebookPublishProgress(payload)) {
        callbacks.onProgress?.(payload);
      }
    },
  });
}

export function verifyFacebookGroupInBrowser(target: FacebookPublishTarget) {
  return sendBridgeRequest<VerifyFacebookGroupPayload>({
    type: GROUP_VERIFY_REQUEST,
    payload: { target },
    timeoutMs: 10 * 60_000,
    isComplete: (event) => event === 'COMPLETED',
  });
}

function sendBridgeRequest<T>(options: {
  type: typeof AUTH_CHECK_REQUEST | typeof PUBLISH_REQUEST | typeof GROUP_VERIFY_REQUEST;
  payload?: unknown;
  timeoutMs: number;
  isComplete: (event: string) => boolean;
  onEvent?: (event: string, payload: unknown) => void;
}): Promise<T> {
  const requestId = newRequestId();

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener('message', handleMessage);
      reject(new Error('VCS Recruitment Posting extension is not connected to this page.'));
    }, options.timeoutMs);

    function cleanup() {
      window.clearTimeout(timeout);
      window.removeEventListener('message', handleMessage);
    }

    function handleMessage(event: MessageEvent<unknown>) {
      if (event.origin !== window.location.origin) return;
      if (!isBridgeResponse(event.data) || event.data.requestId !== requestId) return;

      if (event.data.event === 'ERROR') {
        cleanup();
        reject(new Error(readErrorMessage(event.data.payload)));
        return;
      }

      options.onEvent?.(event.data.event, event.data.payload);
      if (options.isComplete(event.data.event)) {
        cleanup();
        resolve(event.data.payload as T);
      }
    }

    window.addEventListener('message', handleMessage);
    window.postMessage({
      source: FRONTEND_SOURCE,
      type: options.type,
      requestId,
      ...(options.payload === undefined ? {} : { payload: options.payload }),
    }, window.location.origin);
  });
}

function isBridgeResponse(value: unknown): value is BridgeResponse {
  return typeof value === 'object'
    && value !== null
    && (value as { source?: unknown }).source === EXTENSION_SOURCE
    && (value as { type?: unknown }).type === BRIDGE_RESPONSE
    && typeof (value as { requestId?: unknown }).requestId === 'string'
    && typeof (value as { event?: unknown }).event === 'string';
}

function isFacebookPublishProgress(value: unknown): value is FacebookPublishProgress {
  return typeof value === 'object'
    && value !== null
    && typeof (value as { status?: unknown }).status === 'string'
    && typeof (value as { currentIndex?: unknown }).currentIndex === 'number'
    && typeof (value as { total?: unknown }).total === 'number'
    && typeof (value as { message?: unknown }).message === 'string'
    && Array.isArray((value as { results?: unknown }).results);
}

function readErrorMessage(payload: unknown) {
  if (typeof payload === 'object' && payload !== null) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }

  return 'Extension bridge request failed.';
}

function newRequestId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `facebook-bridge-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
