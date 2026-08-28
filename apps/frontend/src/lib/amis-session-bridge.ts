import { secureRandomUUID } from '@/lib/secure-random';

const FRONTEND_SOURCE = 'vcs-recruitment-frontend';
const EXTENSION_SOURCE = 'vcs-recruitment-extension';
const SESSION_CHECK_REQUEST = 'VCS_FRONTEND_AMIS_SESSION_CHECK_REQUEST';
const SESSION_CHECK_RESPONSE = 'VCS_FRONTEND_AMIS_SESSION_CHECK_RESPONSE';

interface AmisSessionCheckResponse {
  source: typeof EXTENSION_SOURCE;
  type: typeof SESSION_CHECK_RESPONSE;
  requestId: string;
  payload: {
    ok: boolean;
    authenticated: boolean;
  };
}

export async function checkAmisAndExtensionSession(timeoutMs = 10_000): Promise<boolean> {
  const requestId = secureRandomUUID();

  return new Promise((resolve) => {
    let settled = false;

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener('message', handleMessage);
    };

    const settle = (authenticated: boolean) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(authenticated);
    };

    const handleMessage = (event: MessageEvent<unknown>) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      if (!isSessionCheckResponse(event.data) || event.data.requestId !== requestId) return;

      settle(event.data.payload.ok && event.data.payload.authenticated);
    };

    const timeoutId = window.setTimeout(() => settle(false), timeoutMs);
    window.addEventListener('message', handleMessage);
    window.postMessage({
      source: FRONTEND_SOURCE,
      type: SESSION_CHECK_REQUEST,
      requestId,
    }, window.location.origin);
  });
}

function isSessionCheckResponse(value: unknown): value is AmisSessionCheckResponse {
  if (typeof value !== 'object' || value === null) return false;

  const candidate = value as {
    source?: unknown;
    type?: unknown;
    requestId?: unknown;
    payload?: unknown;
  };
  if (
    candidate.source !== EXTENSION_SOURCE
    || candidate.type !== SESSION_CHECK_RESPONSE
    || typeof candidate.requestId !== 'string'
    || typeof candidate.payload !== 'object'
    || candidate.payload === null
  ) {
    return false;
  }

  const payload = candidate.payload as { ok?: unknown; authenticated?: unknown };
  return typeof payload.ok === 'boolean' && typeof payload.authenticated === 'boolean';
}
