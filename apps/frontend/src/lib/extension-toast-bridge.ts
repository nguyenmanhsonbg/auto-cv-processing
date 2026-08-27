import {
  EXTENSION_CLOSE_TAB_REQUEST,
  EXTENSION_TOAST_REQUEST,
  EXTENSION_TOAST_SOURCE,
  type ExtensionToastKind,
  type ExtensionToastPayload,
} from '@interview-assistant/shared';

export function showExtensionToast(
  kind: ExtensionToastKind,
  message: string,
  title?: string,
) {
  if (typeof window === 'undefined') return false;

  window.postMessage({
    source: EXTENSION_TOAST_SOURCE,
    type: EXTENSION_TOAST_REQUEST,
    payload: { kind, title, message },
  }, window.location.origin);

  return true;
}

export function closeExtensionTabWithToast(payload: ExtensionToastPayload) {
  if (typeof window === 'undefined') return false;

  window.postMessage({
    source: EXTENSION_TOAST_SOURCE,
    type: EXTENSION_CLOSE_TAB_REQUEST,
    payload,
  }, window.location.origin);

  return true;
}
