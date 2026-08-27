import type { IconProps } from './types';

export function RefreshIcon({ className }: IconProps) {
  return (
    <svg className={className} aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2.33301 2.33336V5.25002H2.67251M11.6302 6.41669C11.3648 4.3086 9.70917 2.64576 7.60224 2.37135C5.49531 2.09694 3.46895 3.28022 2.67251 5.25002M2.67251 5.25002H5.24967M11.6663 11.6667V8.75002H11.3274M11.3274 8.75002C10.5299 10.7186 8.50396 11.9007 6.39773 11.6264C4.29151 11.3521 2.63593 9.69055 2.36917 7.58335M11.3274 8.75002H8.74967" stroke="currentColor" strokeWidth="1.16667" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function HistoryIcon({ className }: IconProps) {
  return (
    <svg className={className} aria-hidden="true" viewBox="0 0 16 16" fill="none">
      <path d="M3.2 4.3A5.4 5.4 0 1 1 2.7 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.8 2.5v2.3h2.3M8 4.8v3.3l2.2 1.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CloseIcon({ className }: IconProps) {
  return (
    <svg className={className} aria-hidden="true" viewBox="0 0 16 16" fill="none">
      <path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function TrashIcon({ className }: IconProps) {
  return (
    <svg className={className} aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M11.083 4.08333L10.5773 11.1662C10.5338 11.7768 10.0257 12.25 9.41351 12.25H4.58584C3.97364 12.25 3.46556 11.7768 3.42209 11.1662L2.91634 4.08333M5.83301 6.41667V9.91667M8.16634 6.41667V9.91667M8.74967 4.08333V2.33333C8.74967 2.01138 8.48829 1.75 8.16634 1.75H5.83301C5.51106 1.75 5.24967 2.01138 5.24967 2.33333V4.08333M2.33301 4.08333H11.6663" stroke="currentColor" strokeWidth="1.16667" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MenuLinesIcon({ className }: IconProps) {
  return (
    <svg className={className} aria-hidden="true" viewBox="0 0 16 16" fill="none">
      <path d="M3 4.2h10M3 8h10M3 11.8h10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function ImageFrameIcon({ className }: IconProps) {
  return (
    <svg className={className} aria-hidden="true" viewBox="0 0 16 16" fill="none">
      <path d="M3 3.5h10v9H3v-9Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="m3.8 11 2.5-2.5 1.8 1.8 1.8-2 2.3 2.7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="10.8" cy="5.8" r="1" fill="currentColor" />
    </svg>
  );
}

export function GridIcon({ className }: IconProps) {
  return (
    <svg className={className} aria-hidden="true" viewBox="0 0 16 16" fill="none">
      <path d="M3 3h4v4H3V3ZM9 3h4v4H9V3ZM3 9h4v4H3V9ZM9 9h4v4H9V9Z" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

export function UploadIcon({ className }: IconProps) {
  return (
    <svg className={className} aria-hidden="true" viewBox="0 0 16 16" fill="none">
      <path d="M8 11V3.5m0 0L5.3 6.2M8 3.5l2.7 2.7M3.5 10.5v2h9v-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CheckCircleIcon({ className }: IconProps) {
  return (
    <svg className={className} width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <path d="M15.2082 6.9485L9.16732 12.9893L5.87648 9.70766L4.58398 11.0002L9.16732 15.5835L16.5007 8.25016L15.2082 6.9485ZM11.0007 1.8335C5.94065 1.8335 1.83398 5.94016 1.83398 11.0002C1.83398 16.0602 5.94065 20.1668 11.0007 20.1668C16.0607 20.1668 20.1673 16.0602 20.1673 11.0002C20.1673 5.94016 16.0607 1.8335 11.0007 1.8335ZM11.0007 18.3335C6.94898 18.3335 3.66732 15.0518 3.66732 11.0002C3.66732 6.9485 6.94898 3.66683 11.0007 3.66683C15.0523 3.66683 18.334 6.9485 18.334 11.0002C18.334 15.0518 15.0523 18.3335 11.0007 18.3335Z" fill="currentColor" />
    </svg>
  );
}

export function FacebookGenerateIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M10.5 4.66667L9.77083 3.0625L8.16667 2.33333L9.77083 1.60417L10.5 0L11.2292 1.60417L12.8333 2.33333L11.2292 3.0625L10.5 4.66667ZM10.5 12.8333L9.77083 11.2292L8.16667 10.5L9.77083 9.77083L10.5 8.16667L11.2292 9.77083L12.8333 10.5L11.2292 11.2292L10.5 12.8333ZM4.66667 11.0833L3.20833 7.875L0 6.41667L3.20833 4.95833L4.66667 1.75L6.125 4.95833L9.33333 6.41667L6.125 7.875L4.66667 11.0833ZM4.66667 8.25417L5.25 7L6.50417 6.41667L5.25 5.83333L4.66667 4.57917L4.08333 5.83333L2.82917 6.41667L4.08333 7L4.66667 8.25417Z" fill="#059669" />
    </svg>
  );
}

export function WarningIcon({ className }: IconProps) {
  return (
    <svg className={className} width="37" height="32" viewBox="0 0 37 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M0 31.6667L18.3333 0L36.6667 31.6667H0ZM18.3333 26.6667C18.8056 26.6667 19.2014 26.5069 19.5208 26.1875C19.8403 25.8681 20 25.4722 20 25C20 24.5278 19.8403 24.1319 19.5208 23.8125C19.2014 23.4931 18.8056 23.3333 18.3333 23.3333C17.8611 23.3333 17.4653 23.4931 17.1458 23.8125C16.8264 24.1319 16.6667 24.5278 16.6667 25C16.6667 25.4722 16.8264 25.8681 17.1458 26.1875C17.4653 26.5069 17.8611 26.6667 18.3333 26.6667ZM16.6667 21.6667H20V13.3333H16.6667V21.6667Z" fill="currentColor"/>
    </svg>
  );
}

export function HomeIcon({ className }: IconProps) {
  return (
    <svg className={className} aria-hidden="true" viewBox="0 0 16 16" fill="none">
      <path d="M2.5 7.2 8 2.8l5.5 4.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.2 6.8v6h2.6V9.3h2.4v3.5h2.6v-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function BackIcon({ className }: IconProps) {
  return (
    <svg className={className} aria-hidden="true" viewBox="0 0 16 16" fill="none">
      <path d="M10 3.5 5.5 8l4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function DoubleBackIcon({ className }: IconProps) {
  return (
    <svg className={className} aria-hidden="true" viewBox="0 0 16 16" fill="none">
      <path d="M8.5 3.5 4 8l4.5 4.5M12 3.5 7.5 8l4.5 4.5" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ChevronRightIcon({ className }: IconProps) {
  return (
    <svg className={className} aria-hidden="true" viewBox="0 0 16 16" fill="none">
      <path d="m6 3.5 4.5 4.5L6 12.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ChevronDownIcon({ className }: IconProps = {}) {
  return (
    <svg className={className} aria-hidden="true" viewBox="0 0 16 16" fill="none">
      <path d="m3.5 6 4.5 4.5L12.5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ChevronUpIcon({ className }: IconProps = {}) {
  return (
    <svg className={className} aria-hidden="true" viewBox="0 0 16 16" fill="none">
      <path d="m3.5 10 4.5-4.5 4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ClockIcon({ className }: IconProps = {}) {
  return (
    <svg className={className} width="13" height="13" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
      <path d="M12 7V12L15.5 14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PlusIcon({ className }: IconProps = {}) {
  return (
    <svg className={className} width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M6 2.5V9.5M2.5 6H9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function SourceIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none">
      <path d="M2.5 5.5h4l1.2 1.4h5.8v6.6h-11V5.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M2.5 5.5V3.8h4.2l1.1 1.7" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

export function DoubleChevronRightIcon({ className }: IconProps) {
  return (
    <svg className={className} aria-hidden="true" viewBox="0 0 16 16" fill="none">
      <path d="M4 3.5 8.5 8 4 12.5M7.5 3.5 12 8l-4.5 4.5" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PostingIcon({ className }: IconProps) {
  return (
    <svg className={className} aria-hidden="true" viewBox="0 0 16 16" fill="none">
      <path d="M5 2.8h5.2L13 5.6v7.6H5V2.8Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M10 2.8v3h3M3 5.2h2M3 8h2M3 10.8h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CvIcon({ className }: IconProps) {
  return (
    <svg className={className} aria-hidden="true" viewBox="0 0 16 16" fill="none">
      <path d="M5.2 2.5h5.6l1.7 1.8v9.2h-9v-11h1.7Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M10.7 2.7v1.8h1.8M5.7 7h4.6M5.7 9.5h4.6M5.7 12h2.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function PeopleIcon({ className }: IconProps) {
  return (
    <svg className={className} aria-hidden="true" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="5.2" r="2.1" fill="currentColor" />
      <path d="M3.8 13c.4-2.2 1.8-3.4 4.2-3.4s3.8 1.2 4.2 3.4" fill="currentColor" />
      <path d="M3.2 7.3a1.7 1.7 0 0 0 0 3.3M12.8 7.3a1.7 1.7 0 0 1 0 3.3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

export function PinIcon({ className, filled = false }: IconProps & { filled?: boolean }) {
  return (
    <svg className={className} aria-hidden="true" viewBox="0 0 16 16" fill={filled ? 'currentColor' : 'none'}>
      <path d="m9.7 1.8 4.5 4.5-2.6.8-2.2 3.5 1.2 1.2-1.1 1.1-2.8-2.8-3.5 3.5-1-1 3.5-3.5-2.8-2.8L4 5.2l1.2 1.2 3.5-2.2.9-2.4Z" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MoreVerticalIcon({ className }: IconProps) {
  return (
    <svg className={className} aria-hidden="true" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="3.5" r="1" fill="currentColor" />
      <circle cx="8" cy="8" r="1" fill="currentColor" />
      <circle cx="8" cy="12.5" r="1" fill="currentColor" />
    </svg>
  );
}

export function DownloadIcon({ className }: IconProps) {
  return (
    <svg className={className} aria-hidden="true" viewBox="0 0 16 16" fill="none">
      <path d="M8 2.5v6.2m0 0 2.5-2.5M8 8.7 5.5 6.2M3.2 10.5v1.7c0 .7.5 1.2 1.2 1.2h7.2c.7 0 1.2-.5 1.2-1.2v-1.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function InfoExportIcon({ className }: IconProps) {
  return (
    <svg className={className} aria-hidden="true" viewBox="0 0 16 16" fill="none">
      <path d="M3.5 2.8h6.2l2.8 2.8v7.6h-9V2.8Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M9.6 2.9v2.8h2.8M5.7 8h4.6M5.7 10.5h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
