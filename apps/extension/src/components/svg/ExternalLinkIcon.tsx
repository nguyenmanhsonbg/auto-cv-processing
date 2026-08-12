import type { IconProps } from './types';

export function ExternalLinkIcon({ className }: IconProps) {
  return (
    <svg className={className} aria-hidden="true" viewBox="0 0 16 16" fill="none">
      <path d="M6.2 4H3.8c-.7 0-1.2.5-1.2 1.2v7c0 .7.5 1.2 1.2 1.2h7c.7 0 1.2-.5 1.2-1.2V9.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.2 2.8h5v5M7.6 8.4l5.2-5.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
