export const EXTENSION_TOAST_SOURCE = 'vcs-recruitment-frontend' as const;
export const EXTENSION_TOAST_REQUEST = 'VCS_FRONTEND_EXTENSION_TOAST' as const;
export const EXTENSION_TOAST_MESSAGE = 'VCS_EXTENSION_TOAST_MESSAGE' as const;
export const EXTENSION_TOAST_EVENT = 'VCS_EXTENSION_TOAST_EVENT' as const;
export const EXTENSION_CLOSE_TAB_REQUEST = 'VCS_FRONTEND_CLOSE_TAB_REQUEST' as const;
export const EXTENSION_CLOSE_TAB_MESSAGE = 'VCS_EXTENSION_CLOSE_TAB_MESSAGE' as const;

export type ExtensionToastKind = 'SUCCESS' | 'ERROR' | 'WARNING' | 'INFO';

export type ExtensionToastPayload = Readonly<{
  kind: ExtensionToastKind;
  title?: string;
  message: string;
}>;
