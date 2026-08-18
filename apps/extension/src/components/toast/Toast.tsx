import type { ReactNode } from 'react';

export type ExtensionToastKind = 'SUCCESS' | 'ERROR' | 'WARNING' | 'INFO';

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

export function ToastSuccessIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="20" height="20" rx="10" fill="#22C55E" />
      <path d="M16.6663 5L7.49967 14.1667L3.33301 10" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ToastErrorIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="20" height="20" rx="10" fill="#EF4444" />
      <path d="M15 5L5 15M5 5L15 15" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ToastWarningIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M9.99965 6.66667V10M9.99965 13.3333H10.008M8.57465 2.38334L1.51632 14.1667C1.37079 14.4187 1.29379 14.7044 1.29298 14.9954C1.29216 15.2865 1.36756 15.5726 1.51167 15.8254C1.65579 16.0783 1.86359 16.289 2.11441 16.4366C2.36523 16.5841 2.65032 16.6635 2.94132 16.6667H17.058C17.349 16.6635 17.6341 16.5841 17.8849 16.4366C18.1357 16.289 18.3435 16.0783 18.4876 15.8254C18.6317 15.5726 18.7071 15.2865 18.7063 14.9954C18.7055 14.7044 18.6285 14.4187 18.483 14.1667L11.4247 2.38334C11.2761 2.13843 11.0669 1.93594 10.8173 1.79541C10.5677 1.65488 10.2861 1.58105 9.99965 1.58105C9.71321 1.58105 9.43159 1.65488 9.18199 1.79541C8.93238 1.93594 8.72321 2.13843 8.57465 2.38334Z"
        stroke="#FB923C"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ToastInfoIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="20" height="20" rx="10" fill="#3B82F6" />
      <path d="M10 9V14M10 6.5V7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ToastCloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M8.8095 8L12.9111 3.11094C12.9798 3.02969 12.922 2.90625 12.8158 2.90625H11.5689C11.4954 2.90625 11.4251 2.93906 11.3767 2.99531L7.99388 7.02813L4.61106 2.99531C4.56419 2.93906 4.49388 2.90625 4.41888 2.90625H3.172C3.06575 2.90625 3.00794 3.02969 3.07669 3.11094L7.17825 8L3.07669 12.8891C3.06129 12.9072 3.05141 12.9293 3.04822 12.9529C3.04503 12.9764 3.04867 13.0004 3.05871 13.022C3.06874 13.0435 3.08475 13.0617 3.10483 13.0745C3.12492 13.0872 3.14823 13.0939 3.172 13.0938H4.41888C4.49231 13.0938 4.56263 13.0609 4.61106 13.0047L7.99388 8.97188L11.3767 13.0047C11.4236 13.0609 11.4939 13.0938 11.5689 13.0938H12.8158C12.922 13.0938 12.9798 12.9703 12.9111 12.8891L8.8095 8Z"
        fill="#6C708A"
      />
    </svg>
  );
}

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
