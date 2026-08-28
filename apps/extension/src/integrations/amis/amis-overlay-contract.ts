export const AMIS_OVERLAY_READY_MESSAGE_TYPE = 'AMIS_OVERLAY_READY' as const;
export const AMIS_OVERLAY_OPEN_REQUEST_MESSAGE_TYPE = 'AMIS_OVERLAY_OPEN_REQUEST' as const;
export const AMIS_OVERLAY_SHOW_MESSAGE_TYPE = 'AMIS_OVERLAY_SHOW' as const;
export const AMIS_OVERLAY_HIDE_MESSAGE_TYPE = 'AMIS_OVERLAY_HIDE' as const;
export const AMIS_OVERLAY_CLOSE_REQUEST_MESSAGE_TYPE = 'AMIS_OVERLAY_CLOSE_REQUEST' as const;

export type AmisOverlayVisibilityMessage = Readonly<{
  type: typeof AMIS_OVERLAY_SHOW_MESSAGE_TYPE | typeof AMIS_OVERLAY_HIDE_MESSAGE_TYPE;
}>;

export type AmisOverlayReadyMessage = Readonly<{
  type: typeof AMIS_OVERLAY_READY_MESSAGE_TYPE;
}>;

export type AmisOverlayOpenRequestMessage = Readonly<{
  type: typeof AMIS_OVERLAY_OPEN_REQUEST_MESSAGE_TYPE;
  tabId: number;
}>;

export type AmisOverlayOpenResponse = Readonly<{
  ok: boolean;
  error?: string;
}>;

export type AmisOverlayCloseRequestMessage = Readonly<{
  type: typeof AMIS_OVERLAY_CLOSE_REQUEST_MESSAGE_TYPE;
}>;

export function isAmisOverlayVisibilityMessage(value: unknown): value is AmisOverlayVisibilityMessage {
  if (typeof value !== 'object' || value === null) return false;
  const type = (value as { type?: unknown }).type;
  return type === AMIS_OVERLAY_SHOW_MESSAGE_TYPE || type === AMIS_OVERLAY_HIDE_MESSAGE_TYPE;
}

export function isAmisOverlayReadyMessage(value: unknown): value is AmisOverlayReadyMessage {
  return typeof value === 'object'
    && value !== null
    && (value as { type?: unknown }).type === AMIS_OVERLAY_READY_MESSAGE_TYPE;
}

export function isAmisOverlayOpenRequestMessage(value: unknown): value is AmisOverlayOpenRequestMessage {
  return typeof value === 'object'
    && value !== null
    && (value as { type?: unknown }).type === AMIS_OVERLAY_OPEN_REQUEST_MESSAGE_TYPE
    && Number.isInteger((value as { tabId?: unknown }).tabId)
    && ((value as { tabId: number }).tabId) > 0;
}

export function isAmisOverlayOpenResponse(value: unknown): value is AmisOverlayOpenResponse {
  return typeof value === 'object'
    && value !== null
    && typeof (value as { ok?: unknown }).ok === 'boolean'
    && ((value as { error?: unknown }).error === undefined
      || typeof (value as { error?: unknown }).error === 'string');
}

export function isAmisOverlayCloseRequestMessage(value: unknown): value is AmisOverlayCloseRequestMessage {
  return typeof value === 'object'
    && value !== null
    && (value as { type?: unknown }).type === AMIS_OVERLAY_CLOSE_REQUEST_MESSAGE_TYPE;
}
