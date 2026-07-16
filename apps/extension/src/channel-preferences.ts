import type { ExtensionChannel } from './types';
import { DEFAULT_POSTING_CHANNELS, POSTING_CHANNELS } from './config';

const SELECTED_CHANNELS_KEY = 'vcs:selected-channels';
const POSTING_CHANNEL_SET = new Set<ExtensionChannel>(POSTING_CHANNELS);

export async function getSelectedChannels(): Promise<ExtensionChannel[]> {
  const values = await chrome.storage?.session?.get(SELECTED_CHANNELS_KEY);
  const channels = values?.[SELECTED_CHANNELS_KEY];
  if (!isExtensionChannelArray(channels)) return [...DEFAULT_POSTING_CHANNELS];

  const sanitizedChannels = sanitizeSelectedChannels(channels);
  return sanitizedChannels.length > 0
    ? sanitizedChannels
    : [...DEFAULT_POSTING_CHANNELS];
}

export async function setSelectedChannels(channels: ExtensionChannel[]) {
  await chrome.storage?.session?.set({
    [SELECTED_CHANNELS_KEY]: sanitizeSelectedChannels(channels),
  });
}

function sanitizeSelectedChannels(channels: ExtensionChannel[]) {
  const seen = new Set<ExtensionChannel>();
  return channels.filter((channel) => {
    if (!POSTING_CHANNEL_SET.has(channel) || seen.has(channel)) return false;
    seen.add(channel);
    return true;
  });
}

function isExtensionChannelArray(value: unknown): value is ExtensionChannel[] {
  return Array.isArray(value)
    && value.every((item) => (
      item === 'VCS_PORTAL'
      || item === 'FACEBOOK'
      || item === 'TOPCV'
      || item === 'ITVIEC'
      || item === 'VIETNAMWORKS'
      || item === 'LINKEDIN'
    ));
}
