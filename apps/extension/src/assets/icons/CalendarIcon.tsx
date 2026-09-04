import type { IconProps } from './types';

export interface CalendarIconProps extends IconProps {
  width?: number | string;
  height?: number | string;
  color?: string;
}

export function CalendarIcon({
  className,
  width = 16,
  height = 16,
  color = 'currentColor',
}: Readonly<CalendarIconProps> = {}) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M7.86333 13.9999H3.33333C2.59695 13.9999 2 13.403 2 12.6666V4.66659C2 3.93021 2.59695 3.33325 3.33333 3.33325H11.3333C12.0697 3.33325 12.6667 3.93021 12.6667 4.66659V7.33325"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 9.33325V11.9999H14.6667"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx="12.0007"
        cy="11.9999"
        r="2.66667"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.99935 2V4.66667"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4.66732 2V4.66667"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2 7.33333H12.6667"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
