import type { IconProps } from './types';

export function UnlockIcon({ className = 'referral-action-icon' }: IconProps) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" stroke="#2F2B3D" strokeOpacity="0.9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="16" r="1" stroke="#2F2B3D" strokeOpacity="0.9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 11V6C8 3.79086 9.79086 2 12 2C14.20914 2 16 3.79086 16 6" stroke="#2F2B3D" strokeOpacity="0.9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ActionLockIcon({ className = 'referral-action-icon' }: IconProps) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" stroke="#2F2B3D" strokeOpacity="0.9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="16" r="1" stroke="#2F2B3D" strokeOpacity="0.9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 11V7C8 4.79086 9.79086 3 12 3C14.20914 3 16 4.79086 16 7V11" stroke="#2F2B3D" strokeOpacity="0.9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ReferralWarningIcon({ className = 'referral-warning-icon' }: IconProps) {
  return (
    <svg className={className} aria-hidden="true" viewBox="0 0 32 32" fill="none">
      <path d="m16 4 13 23H3L16 4Z" fill="currentColor" />
      <path d="M16 11v8M16 23h.01" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function CopyIcon({ className = 'referral-copy-icon' }: IconProps) {
  return (
    <svg className={className} aria-hidden="true" viewBox="0 0 16 16" fill="none">
      <rect x="5.2" y="4.4" width="7.2" height="8.2" rx="1.1" stroke="currentColor" strokeWidth="1.2" />
      <path d="M3.6 10.2H3a1 1 0 0 1-1-1V3.6a1 1 0 0 1 1-1h5.6a1 1 0 0 1 1 1v.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function SearchClearIcon({ className = 'referral-search-clear-icon' }: IconProps) {
  return (
    <svg className={className} aria-hidden="true" viewBox="0 0 16 16" fill="none">
      <path d="m4.5 4.5 7 7m0-7-7 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function DetailChevronIcon({ isOpen, className }: { isOpen: boolean; className?: string }) {
  return (
    <svg
      className={`referral-detail-chevron${isOpen ? ' is-open' : ''}${className ? ` ${className}` : ''}`}
      width="10"
      height="6"
      viewBox="0 0 10 6"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M1 1L5 5L9 1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PlusIcon({ className }: IconProps) {
  return (
    <svg className={className} width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M6 2.5V9.5M2.5 6H9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
