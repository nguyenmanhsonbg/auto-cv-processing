import type { AmisAutoSyncState } from './types';

const LAST_AUTO_SYNC_KEY = 'vcs:last-amis-auto-sync';

export async function saveLastAutoSyncState(state: AmisAutoSyncState) {
  await chrome.storage?.session?.set({
    [LAST_AUTO_SYNC_KEY]: state,
  });

  await chrome.runtime?.sendMessage?.({
    type: 'AMIS_AUTO_SYNC_STATE_UPDATED',
    payload: state,
  }).catch(() => undefined);
}

export async function getLastAutoSyncState() {
  const values = await chrome.storage?.session?.get(LAST_AUTO_SYNC_KEY);
  const state = values?.[LAST_AUTO_SYNC_KEY];
  return isAutoSyncState(state) ? state : null;
}

function isAutoSyncState(value: unknown): value is AmisAutoSyncState {
  return typeof value === 'object'
    && value !== null
    && 'status' in value
    && 'updatedAt' in value;
}
