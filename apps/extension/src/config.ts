import type { ExtensionChannel } from './types';

export const BE_API_BASE_URL =
  (import.meta.env.VITE_BE_API_BASE_URL as string | undefined)?.replace(/\/+$/, '')
  ?? 'http://localhost:3002/api';

export const EXTENSION_VERSION = '0.1.0';

export const EXTENSION_TASK_QUEUE_ENABLED = false;

export const FACEBOOK_MAX_IMAGE_ATTACHMENTS = 2;

export const EXTENSION_CAPABILITIES = [
  'FACEBOOK_PUBLISH',
  'FACEBOOK_VERIFY',
] as const;

export const CHANNELS = [
  'VCS_PORTAL',
  'FACEBOOK',
  'TOPCV',
  'ITVIEC',
  'VIETNAMWORKS',
  'LINKEDIN',
] as const;

export const POSTING_CHANNELS = [
  'FACEBOOK',
  'TOPCV',
  'LINKEDIN',
] as const satisfies readonly ExtensionChannel[];

export const DEFAULT_POSTING_CHANNELS: ExtensionChannel[] = ['TOPCV'];
