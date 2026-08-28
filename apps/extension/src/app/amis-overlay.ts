import {
  isAmisOverlayCloseRequestMessage,
  AMIS_OVERLAY_READY_MESSAGE_TYPE,
  AMIS_OVERLAY_SHOW_MESSAGE_TYPE,
  isAmisOverlayVisibilityMessage,
} from '@/integrations/amis/amis-overlay-contract';
import { isAllowedSidePanelUrl } from '@/lib/side-panel-scope';

const OVERLAY_HOST_ID = '__vcs_recruitment_extension_overlay__';
const OVERLAY_IFRAME_TITLE = 'VCS Recruitment Posting';
const DEFAULT_OVERLAY_WIDTH = 480;
const MIN_OVERLAY_WIDTH = 360;
const runtime = globalThis as typeof globalThis & {
  __vcsAmisOverlayListenerInstalled__?: boolean;
};

if (!runtime.__vcsAmisOverlayListenerInstalled__) {
  runtime.__vcsAmisOverlayListenerInstalled__ = true;

  chrome.runtime?.onMessage.addListener((message) => {
    if (!isAmisOverlayVisibilityMessage(message)) return;

    if (message.type === AMIS_OVERLAY_SHOW_MESSAGE_TYPE) {
      showOverlay();
      return;
    }

    hideOverlay();
  });

  window.addEventListener('message', handleOverlayWindowMessage);

  sendReadyMessage();
}

function sendReadyMessage() {
  const pendingResponse = chrome.runtime?.sendMessage?.({
    type: AMIS_OVERLAY_READY_MESSAGE_TYPE,
  });
  if (pendingResponse) {
    void pendingResponse.catch(() => undefined);
  }
}

function showOverlay() {
  if (!isAllowedSidePanelUrl(window.location.href)) return;

  const host = getOrCreateOverlayHost();
  if (!host) return;

  host.style.display = 'block';
  host.setAttribute('aria-hidden', 'false');
}

function hideOverlay() {
  const host = document.getElementById(OVERLAY_HOST_ID);
  if (!host) return;

  host.style.display = 'none';
  host.setAttribute('aria-hidden', 'true');
}

function handleOverlayWindowMessage(event: MessageEvent) {
  if (!isAmisOverlayCloseRequestMessage(event.data)) return;

  const host = document.getElementById(OVERLAY_HOST_ID);
  const iframe = host?.querySelector('iframe');
  if (!iframe || event.source !== iframe.contentWindow) return;

  hideOverlay();
}

function getOrCreateOverlayHost() {
  const existingHost = document.getElementById(OVERLAY_HOST_ID);
  if (existingHost) return existingHost;
  if (!document.documentElement) return null;

  const host = document.createElement('div');
  host.id = OVERLAY_HOST_ID;
  host.setAttribute('aria-label', OVERLAY_IFRAME_TITLE);
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = [
    'position: fixed',
    'inset: 0 0 0 auto',
    `width: ${DEFAULT_OVERLAY_WIDTH}px`,
    'max-width: 100vw',
    'height: 100vh',
    'display: none',
    'z-index: 2147483647',
    'background: #ffffff',
    'box-shadow: -4px 0 16px rgba(15, 23, 42, 0.18)',
    'pointer-events: auto',
    'isolation: isolate',
  ].join(';');

  const resizeHandle = document.createElement('button');
  resizeHandle.type = 'button';
  resizeHandle.title = 'Kéo để thay đổi chiều rộng extension';
  resizeHandle.setAttribute('aria-label', 'Thay đổi chiều rộng extension');
  resizeHandle.style.cssText = [
    'position: absolute',
    'top: 0',
    'left: 0',
    'width: 8px',
    'height: 100%',
    'padding: 0',
    'border: 0',
    'background: transparent',
    'cursor: col-resize',
    'z-index: 2',
  ].join(';');
  resizeHandle.addEventListener('pointerdown', (event) => {
    startOverlayResize(event, host, resizeHandle);
  });
  resizeHandle.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;

    event.preventDefault();
    const currentWidth = host.getBoundingClientRect().width;
    const direction = event.key === 'ArrowLeft' ? 1 : -1;
    setOverlayWidth(host, currentWidth + direction * 16);
  });

  const iframe = document.createElement('iframe');
  iframe.title = OVERLAY_IFRAME_TITLE;
  iframe.src = chrome.runtime?.getURL?.('side-panel.html') ?? '';
  iframe.setAttribute('aria-label', OVERLAY_IFRAME_TITLE);
  iframe.style.cssText = [
    'display: block',
    'width: 100%',
    'height: 100%',
    'border: 0',
    'background: #ffffff',
  ].join(';');

  host.append(resizeHandle, iframe);
  document.documentElement.appendChild(host);
  return host;
}

function startOverlayResize(
  event: PointerEvent,
  host: HTMLElement,
  resizeHandle: HTMLButtonElement,
) {
  event.preventDefault();
  event.stopPropagation();

  resizeHandle.setPointerCapture?.(event.pointerId);

  const initialWidth = host.getBoundingClientRect().width;
  const initialPointerX = event.clientX;

  const handlePointerMove = (moveEvent: PointerEvent) => {
    moveEvent.preventDefault();
    const widthDelta = initialPointerX - moveEvent.clientX;
    setOverlayWidth(host, initialWidth + widthDelta);
  };

  const stopResizing = () => {
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', stopResizing);
    window.removeEventListener('pointercancel', stopResizing);

    if (resizeHandle.hasPointerCapture?.(event.pointerId)) {
      resizeHandle.releasePointerCapture(event.pointerId);
    }
  };

  window.addEventListener('pointermove', handlePointerMove, { passive: false });
  window.addEventListener('pointerup', stopResizing, { once: true });
  window.addEventListener('pointercancel', stopResizing, { once: true });
}

function setOverlayWidth(host: HTMLElement, width: number) {
  const maxWidth = Math.max(MIN_OVERLAY_WIDTH, window.innerWidth);
  const boundedWidth = Math.min(maxWidth, Math.max(MIN_OVERLAY_WIDTH, width));
  host.style.width = `${boundedWidth}px`;
}
