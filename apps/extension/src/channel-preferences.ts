import type { ExtensionChannel } from './types';

const SELECTED_CHANNELS_KEY = 'vcs:selected-channels';
const DEFAULT_CHANNELS: ExtensionChannel[] = ['VCS_PORTAL'];

export async function getSelectedChannels(): Promise<ExtensionChannel[]> {
  const values = await chrome.storage?.session?.get(SELECTED_CHANNELS_KEY);
  const channels = values?.[SELECTED_CHANNELS_KEY];
  return isExtensionChannelArray(channels) && channels.length > 0 ? channels : DEFAULT_CHANNELS;
}

export async function setSelectedChannels(channels: ExtensionChannel[]) {
  await chrome.storage?.session?.set({
    [SELECTED_CHANNELS_KEY]: channels.length > 0 ? channels : DEFAULT_CHANNELS,
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
