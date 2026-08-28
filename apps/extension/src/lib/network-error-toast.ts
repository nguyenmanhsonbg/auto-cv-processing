import type { ExtensionToastPayload } from '@interview-assistant/shared';

export const NETWORK_ERROR_TOAST_EVENT = 'VCS_NETWORK_ERROR_TOAST' as const;
export const NETWORK_ERROR_TOAST_MESSAGE = 'Có lỗi kết nối mạng, vui lòng kiểm tra lại.' as const;
const EXTENSION_TOAST_EVENT = 'VCS_EXTENSION_TOAST_EVENT' as const;

const NETWORK_UNAVAILABLE_STATUSES = new Set([502, 503, 504]);

export function isNetworkUnavailableStatus(status: unknown): status is number {
  return typeof status === 'number' && NETWORK_UNAVAILABLE_STATUSES.has(status);
}

export function isNetworkUnavailableError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return error instanceof Error && /failed to fetch|network|connection refused|connection reset/i.test(error.message);
  }

  const candidate = error as {
    code?: unknown;
    status?: unknown;
    message?: unknown;
  };

  if (candidate.code === 'NETWORK_ERROR' || candidate.status === 0 || isNetworkUnavailableStatus(candidate.status)) {
    return true;
  }

  return typeof candidate.message === 'string'
    && /failed to fetch|fetch failed|network|connection refused|connection reset|unable to connect/i.test(candidate.message);
}

export function notifyNetworkErrorToast() {
  const payload: ExtensionToastPayload = {
    kind: 'ERROR',
    title: 'Lỗi',
    message: NETWORK_ERROR_TOAST_MESSAGE,
  };

  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent(NETWORK_ERROR_TOAST_EVENT));
    return;
  }

  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    void chrome.runtime.sendMessage({
      type: EXTENSION_TOAST_EVENT,
      payload,
    }).catch(() => undefined);
  }
}
