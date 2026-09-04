import type { IconProps } from './types';

export interface ExtendedIconProps extends IconProps {
  width?: number | string;
  height?: number | string;
  color?: string;
}

export function CalendarStatsIcon({ className, width = 16, height = 16, color = '#262626' }: Readonly<ExtendedIconProps> = {}) {
  return (
    <svg width={width} height={height} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
      <path d="M7.86333 13.9999H3.33333C2.59695 13.9999 2 13.403 2 12.6666V4.66659C2 3.93021 2.59695 3.33325 3.33333 3.33325H11.3333C12.0697 3.33325 12.6667 3.93021 12.6667 4.66659V7.33325" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 9.33325V11.9999H14.6667" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12.0007" cy="11.9999" r="2.66667" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.99935 2V4.66667" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.66732 2V4.66667" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 7.33333H12.6667" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SmallChevronDown({ className, width = 12, height = 12, color = 'currentColor' }: Readonly<ExtendedIconProps> = {}) {
  return (
    <svg width={width} height={height} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
      <path d="M4 6L8 10L12 6" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SmallChevronUp({ className, width = 12, height = 12, color = 'currentColor' }: Readonly<ExtendedIconProps> = {}) {
  return (
    <svg width={width} height={height} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
      <path d="M4 10L8 6L12 10" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function NavArrowLeft({ className, width = 14, height = 14, color = 'currentColor' }: Readonly<ExtendedIconProps> = {}) {
  return (
    <svg width={width} height={height} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
      <path d="M10 12L6 8L10 4" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function NavArrowRight({ className, width = 14, height = 14, color = 'currentColor' }: Readonly<ExtendedIconProps> = {}) {
  return (
    <svg width={width} height={height} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
      <path d="M6 12L10 8L6 4" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function StepperMinusIcon({ className, width = 16, height = 16, color = '#262626' }: Readonly<ExtendedIconProps> = {}) {
  return (
    <svg width={width} height={height} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
      <path d="M3.33398 8.00008H12.6673" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function StepperPlusIcon({ className, width = 16, height = 16, color = '#262626' }: Readonly<ExtendedIconProps> = {}) {
  return (
    <svg width={width} height={height} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
      <path d="M7.99935 3.33325V12.6666" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.33398 8.00008H12.6673" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ChipCloseIcon({ className, width = 10, height = 10, color = '#15803D' }: Readonly<ExtendedIconProps> = {}) {
  return (
    <svg width={width} height={height} viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
      <path d="M7.5 2.5L2.5 7.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.5 2.5L7.5 7.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
