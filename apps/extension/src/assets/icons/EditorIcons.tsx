import type { IconProps } from './types';

export function UndoIcon({ className }: IconProps) {
  return (
    <svg className={className} width="16" height="24" viewBox="0 0 16 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M6.5 8.5L4 11L6.5 13.5M4 11H10C10.5304 11 11.0391 11.2107 11.4142 11.5858C11.7893 11.9609 12 12.4696 12 13V16.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function RedoIcon({ className }: IconProps) {
  return (
    <svg className={className} width="16" height="24" viewBox="0 0 16 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M9.5 8.5L12 11L9.5 13.5M12 11H6C5.46957 11 4.96086 11.2107 4.58579 11.5858C4.21071 11.9609 4 12.4696 4 13V16.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function BulletListIcon({ className }: IconProps) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M9.33333 8.5H18M9.33333 12.5H18M9.33333 16.5H18M6 8.5H6.00667M6 12.5H6.00667M6 16.5H6.00667"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function NumberedListIcon({ className }: IconProps) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M11.334 8.25H17.334" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11.334 12H17.334" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 15.75H17.3333" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M6.66602 14.5C6.66602 13.8096 7.26297 13.25 7.99935 13.25C8.73573 13.25 9.33268 13.8096 9.33268 14.5C9.33268 14.8694 8.99935 15.125 8.66602 15.4375L6.66602 17H9.33268"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M7.99935 10.75V7L6.66602 8.25" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
