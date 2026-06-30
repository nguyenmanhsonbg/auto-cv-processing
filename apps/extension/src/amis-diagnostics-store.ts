import type { AmisDiagnosticEvent } from './types';

const AMIS_DIAGNOSTICS_KEY = 'vcs:amis-diagnostics';
const MAX_EVENTS = 20;

export async function appendAmisDiagnostic(event: AmisDiagnosticEvent) {
  const events = await getAmisDiagnostics();
  const nextEvents = [...events, event].slice(-MAX_EVENTS);

  await chrome.storage?.session?.set({
    [AMIS_DIAGNOSTICS_KEY]: nextEvents,
  });

  await chrome.runtime?.sendMessage?.({
    type: 'AMIS_DIAGNOSTIC_UPDATED',
    payload: nextEvents,
  }).catch(() => undefined);
}

export async function getAmisDiagnostics() {
  const values = await chrome.storage?.session?.get(AMIS_DIAGNOSTICS_KEY);
  const events = values?.[AMIS_DIAGNOSTICS_KEY];

  return Array.isArray(events)
    ? events.filter(isAmisDiagnosticEvent)
    : [];
}

function isAmisDiagnosticEvent(value: unknown): value is AmisDiagnosticEvent {
  return typeof value === 'object'
    && value !== null
    && typeof (value as { type?: unknown }).type === 'string'
    && typeof (value as { pageUrl?: unknown }).pageUrl === 'string'
    && typeof (value as { timestamp?: unknown }).timestamp === 'string';
}
