import type { IconProps } from './types';

export function TopCvWarningIcon({ className }: Readonly<IconProps>) {
  return (
    <svg className={className} width="22" height="22" viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M13 8.66669V12.7634" stroke="#DC2626" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13 16.8337L13 16.8852" stroke="#DC2626" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.41647 20.5833H20.5831C21.3009 20.5783 21.9696 20.2181 22.3687 19.6216C22.7678 19.025 22.8457 18.2695 22.5765 17.6041L14.8848 4.33331C14.5032 3.64363 13.7772 3.21558 12.989 3.21558C12.2008 3.21558 11.4747 3.64363 11.0931 4.33331L3.40147 17.6041C3.13757 18.2539 3.20444 18.9911 3.58093 19.5827C3.95742 20.1744 4.59697 20.5472 5.29731 20.5833" stroke="#DC2626" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
