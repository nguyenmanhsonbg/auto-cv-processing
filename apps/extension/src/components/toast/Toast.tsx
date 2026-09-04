import type { ReactNode } from 'react';
import type { ExtensionToastKind } from '@interview-assistant/shared';

export type { ExtensionToastKind } from '@interview-assistant/shared';

export type ExtensionToastState = {
  id: number;
  kind: ExtensionToastKind;
  title: string;
  message: string;
};

export type ToastProps = {
  kind: ExtensionToastKind;
  title?: string;
  message: string;
  onClose: () => void;
};

import {
  ToastSuccessIcon,
  ToastErrorIcon,
  ToastWarningIcon,
  ToastInfoIcon,
  ToastCloseIcon,
} from '@/assets/icons';

export {
  ToastSuccessIcon,
  ToastErrorIcon,
  ToastWarningIcon,
  ToastInfoIcon,
  ToastCloseIcon,
} from '@/assets/icons';

function getToastIcon(kind: ExtensionToastKind): ReactNode {
  switch (kind) {
    case 'SUCCESS':
      return <ToastSuccessIcon />;
    case 'ERROR':
      return <ToastErrorIcon />;
    case 'WARNING':
      return <ToastWarningIcon />;
    case 'INFO':
      return <ToastInfoIcon />;
  }
}

function getDefaultToastTitle(kind: ExtensionToastKind): string {
  switch (kind) {
    case 'SUCCESS':
      return 'Thành công';
    case 'ERROR':
      return 'Lỗi';
    case 'WARNING':
      return 'Cảnh báo';
    case 'INFO':
      return 'Thông tin';
  }
}

export function Toast({ kind, title, message, onClose }: ToastProps) {
  const displayTitle = title || getDefaultToastTitle(kind);

  return (
    <aside
      className={`extension-toast is-${kind.toLowerCase()}`}
      role="status"
      aria-live="polite"
    >
      <div className="extension-toast-accent" aria-hidden="true" />
      <div className="extension-toast-body">
        <div className="extension-toast-icon" aria-hidden="true">
          {getToastIcon(kind)}
        </div>
        <div className="extension-toast-copy">
          <strong>{displayTitle}</strong>
          <span>{message}</span>
        </div>
        <button
          type="button"
          className="extension-toast-close"
          title="Đóng thông báo"
          aria-label="Đóng thông báo"
          onClick={onClose}
        >
          <ToastCloseIcon />
        </button>
      </div>
      <span className="extension-toast-progress" aria-hidden="true" />
    </aside>
  );
}
