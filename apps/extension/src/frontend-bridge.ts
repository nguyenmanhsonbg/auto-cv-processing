import type { FacebookPublishPlan, FacebookPublishTarget } from './types';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

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
    void exportAiMatchPreviewPdf()
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

async function exportAiMatchPreviewPdf() {
  const preview = document.querySelector<HTMLElement>('.ai-match-preview-dialog');
  if (!preview) {
    const previewButton = Array.from(document.querySelectorAll<HTMLElement>('button'))
      .find((button) => /preview ai match/i.test(button.innerText || button.textContent || ''));
    previewButton?.click();
    await waitForSelector('.ai-match-preview-dialog', 15_000);
  }

  const element = document.querySelector<HTMLElement>('.ai-match-preview-dialog');
  if (!element) throw new Error('AI Match Preview dialog was not found.');

  document.body.classList.add('ai-match-preview-exporting');
  try {
    await nextAnimationFrame();
    await nextAnimationFrame();
    const canvas = await html2canvas(element, {
      backgroundColor: '#ffffff',
      height: element.scrollHeight,
      logging: false,
      scale: Math.min(window.devicePixelRatio || 1, 2),
      useCORS: true,
      width: element.scrollWidth,
      onclone: (clonedDocument) => {
        const clonedDialog = clonedDocument.querySelector<HTMLElement>('.ai-match-preview-dialog');
        const clonedScroll = clonedDocument.querySelector<HTMLElement>('.ai-match-preview-scroll');
        for (const node of [clonedDialog, clonedScroll]) {
          if (!node) continue;
          node.style.display = 'block';
          node.style.position = 'static';
          node.style.flex = 'none';
          node.style.height = 'auto';
          node.style.maxHeight = 'none';
          node.style.overflow = 'visible';
        }
      },
    });

    const pdf = new jsPDF({ compress: true, format: 'a4', orientation: 'portrait', unit: 'mm' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 10;
    const contentWidth = pageWidth - margin * 2;
    const contentHeight = pageHeight - margin * 2;
    const pageHeightInPixels = Math.max(1, Math.floor((contentHeight / contentWidth) * canvas.width));
    let offsetY = 0;
    let pageIndex = 0;
    while (offsetY < canvas.height) {
      const sliceHeight = Math.min(pageHeightInPixels, canvas.height - offsetY);
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = canvas.width;
      pageCanvas.height = sliceHeight;
      const context = pageCanvas.getContext('2d');
      if (!context) throw new Error('Could not prepare the AI Match Preview PDF.');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      context.drawImage(canvas, 0, offsetY, canvas.width, sliceHeight, 0, 0, pageCanvas.width, pageCanvas.height);
      if (pageIndex > 0) pdf.addPage();
      pdf.addImage(pageCanvas.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, contentWidth, (sliceHeight / canvas.width) * contentWidth);
      offsetY += sliceHeight;
      pageIndex += 1;
    }

    return arrayBufferToBase64(pdf.output('arraybuffer'));
  } finally {
    document.body.classList.remove('ai-match-preview-exporting');
  }
}

function isExportAiMatchPreviewPdfRequest(value: unknown): value is { type: string; requestId: string } {
  return typeof value === 'object'
    && value !== null
    && (value as { type?: unknown }).type === EXPORT_AI_MATCH_PREVIEW_PDF_MESSAGE
    && typeof (value as { requestId?: unknown }).requestId === 'string';
}

function waitForSelector(selector: string, timeoutMs: number) {
  if (document.querySelector(selector)) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      observer.disconnect();
      reject(new Error('AI Match Preview did not open in time.'));
    }, timeoutMs);
    const observer = new MutationObserver(() => {
      if (!document.querySelector(selector)) return;
      window.clearTimeout(timeoutId);
      observer.disconnect();
      resolve();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
}

function nextAnimationFrame() {
  return new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
}

function arrayBufferToBase64(value: ArrayBuffer) {
  const bytes = new Uint8Array(value);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary);
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
