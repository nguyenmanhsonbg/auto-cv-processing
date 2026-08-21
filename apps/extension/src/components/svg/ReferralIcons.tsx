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
      width="6"
      height="11"
      viewBox="0 0 6 11"
      fill="none"
      aria-hidden="true"
    >
      <path d="M0.859375 10.8594L5.85938 5.85937C5.90104 5.80729 5.9349 5.7526 5.96094 5.69531C5.98698 5.63802 6 5.57292 6 5.5C6 5.42708 5.98698 5.36198 5.96094 5.30469C5.9349 5.2474 5.90104 5.19271 5.85938 0.140625L0.859375 0.140625C0.807292 0.0989583 0.752604 0.0651042 0.695312 0.0390625C0.638021 0.0130208 0.572917 0 0.5 0C0.364583 0 0.247396 0.0494792 0.148438 0.148437C0.0494792 0.247396 0 0.364583 0 0.5C0 0.572917 0.0130208 0.638021 0.0390625 0.695312C0.0651042 0.752604 0.0989583 0.807292 0.140625 0.859375L4.79688 5.5L0.140625 10.1406C0.0989583 10.1927 0.0651042 10.2474 0.0390625 10.3047C0.0130208 10.362 0 10.4271 0 10.5C0 10.6354 0.0494792 10.7526 0.148438 10.8516C0.247396 10.9505 0.364583 11 0.5 11C0.572917 11 0.638021 10.987 0.695313 10.9609C0.752604 10.9349 0.807292 10.901 0.859375 10.8594Z" fill="white" />
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
