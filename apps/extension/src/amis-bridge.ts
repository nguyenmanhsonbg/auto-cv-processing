import type { AmisDiagnosticEvent, AmisExtractionResult } from './types';

const AMIS_CAPTURE_MESSAGE_TYPE = 'VCS_AMIS_SAVE_RECRUITMENT_CAPTURED';
const AMIS_DIAGNOSTIC_MESSAGE_TYPE = 'VCS_AMIS_DIAGNOSTIC';
const BACKGROUND_MESSAGE_TYPE = 'AMIS_RECRUITMENT_SAVED';
const BACKGROUND_DIAGNOSTIC_MESSAGE_TYPE = 'AMIS_DIAGNOSTIC_EVENT';
const BRIDGE_INSTALLED_KEY = '__VCS_AMIS_BRIDGE_INSTALLED__';

const bridgeWindow = window as Window & {
  __VCS_AMIS_BRIDGE_INSTALLED__?: boolean;
};
const wasBridgeInstalled = bridgeWindow[BRIDGE_INSTALLED_KEY] === true;

if (!wasBridgeInstalled) {
  bridgeWindow[BRIDGE_INSTALLED_KEY] = true;
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.origin !== window.location.origin) return;
    if (isCaptureMessage(event.data)) {
      void chrome.runtime?.sendMessage?.({
        type: BACKGROUND_MESSAGE_TYPE,
        payload: event.data.payload,
      }).catch(() => undefined);
      return;
    }

    if (isDiagnosticMessage(event.data)) {
      sendDiagnostic(event.data.payload);
    }
  });
}

sendDiagnostic({
  type: 'BRIDGE_READY',
  pageUrl: window.location.href,
  timestamp: new Date().toISOString(),
  frameUrl: window.location.href,
  details: {
    reused: wasBridgeInstalled,
  },
});

function sendDiagnostic(event: AmisDiagnosticEvent) {
  void chrome.runtime?.sendMessage?.({
    type: BACKGROUND_DIAGNOSTIC_MESSAGE_TYPE,
    payload: event,
  }).catch(() => undefined);
}

function isCaptureMessage(value: unknown): value is {
  source: 'vcs-recruitment-extension';
  type: typeof AMIS_CAPTURE_MESSAGE_TYPE;
  payload: AmisExtractionResult;
} {
  return typeof value === 'object'
    && value !== null
    && (value as { source?: unknown }).source === 'vcs-recruitment-extension'
    && (value as { type?: unknown }).type === AMIS_CAPTURE_MESSAGE_TYPE
    && isAmisExtractionResult((value as { payload?: unknown }).payload);
}

function isDiagnosticMessage(value: unknown): value is {
  source: 'vcs-recruitment-extension';
  type: typeof AMIS_DIAGNOSTIC_MESSAGE_TYPE;
  payload: AmisDiagnosticEvent;
} {
  return typeof value === 'object'
    && value !== null
    && (value as { source?: unknown }).source === 'vcs-recruitment-extension'
    && (value as { type?: unknown }).type === AMIS_DIAGNOSTIC_MESSAGE_TYPE
    && isAmisDiagnosticEvent((value as { payload?: unknown }).payload);
}

function isAmisExtractionResult(value: unknown): value is AmisExtractionResult {
  return typeof value === 'object'
    && value !== null
    && (value as { source?: unknown }).source === 'AMIS_SAVE_RECRUITMENT_API'
    && typeof (value as { url?: unknown }).url === 'string';
}

function isAmisDiagnosticEvent(value: unknown): value is AmisDiagnosticEvent {
  return typeof value === 'object'
    && value !== null
    && typeof (value as { type?: unknown }).type === 'string'
    && typeof (value as { pageUrl?: unknown }).pageUrl === 'string'
    && typeof (value as { timestamp?: unknown }).timestamp === 'string';
}
