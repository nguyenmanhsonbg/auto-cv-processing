import type { KeyboardEventHandler, ReactNode, Ref } from 'react';
import { SearchIcon } from '@/assets/icons';

type SearchFieldProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  leading?: ReactNode;
  clearButton?: ReactNode;
  type?: 'text' | 'search';
  maxLength?: number;
  inputRef?: Ref<HTMLInputElement>;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
};

export function SearchField({
  value,
  onChange,
  placeholder,
  ariaLabel,
  className = '',
  leading = <SearchIcon />,
  clearButton,
  type = 'text',
  maxLength,
  inputRef,
  onKeyDown,
}: SearchFieldProps) {
  return (
    <label className={`shared-filter-search ${className}`.trim()}>
      {leading}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        type={type}
        maxLength={maxLength}
        ref={inputRef}
        onKeyDown={onKeyDown}
      />
      {clearButton}
    </label>
  );
}
