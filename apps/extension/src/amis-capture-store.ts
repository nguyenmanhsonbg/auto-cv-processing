import type { AmisExtractionResult } from './types';

const LAST_AMIS_CAPTURE_KEY = 'vcs:last-amis-capture';

export async function saveLastAmisCapture(capture: AmisExtractionResult) {
  await chrome.storage?.session?.set({
    [LAST_AMIS_CAPTURE_KEY]: capture,
  });
}

export async function getLastAmisCapture() {
  const values = await chrome.storage?.session?.get(LAST_AMIS_CAPTURE_KEY);
  const capture = values?.[LAST_AMIS_CAPTURE_KEY];
  return isAmisExtractionResult(capture) ? capture : null;
}

function isAmisExtractionResult(value: unknown): value is AmisExtractionResult {
  return typeof value === 'object'
    && value !== null
    && 'source' in value
    && 'status' in value
    && 'url' in value;
}
