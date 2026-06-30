export const BE_API_BASE_URL =
  (import.meta.env.VITE_BE_API_BASE_URL as string | undefined)?.replace(/\/+$/, '')
  ?? 'http://localhost:3002/api';

export const EXTENSION_VERSION = '0.1.0';

export const CHANNELS = [
  'VCS_PORTAL',
  'FACEBOOK',
  'TOPCV',
  'ITVIEC',
  'VIETNAMWORKS',
  'LINKEDIN',
] as const;
