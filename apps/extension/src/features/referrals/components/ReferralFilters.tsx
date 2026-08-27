import type { KeyboardEventHandler, PropsWithChildren, ReactNode } from 'react';
import { SearchField } from '@/components/filters';
import { SearchIcon } from '@/components/icons';

type ReferralFiltersProps = PropsWithChildren<{
  source: 'INTERNAL' | 'FREELANCER';
  search: string;
  onSearchChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
  action?: ReactNode;
  clearButton?: ReactNode;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
}>;

export function ReferralFilters({ source, search, onSearchChange, placeholder, ariaLabel, action, clearButton, onKeyDown, children }: ReferralFiltersProps) {
  return (
    <div className={`referral-toolbar ${source === 'INTERNAL' ? 'is-internal' : ''}`.trim()}>
      <div className="referral-search-action-row">
        <SearchField
          className="referral-search-field"
          value={search}
          onChange={onSearchChange}
          placeholder={placeholder}
          ariaLabel={ariaLabel}
          leading={<SearchIcon />}
          clearButton={clearButton}
          onKeyDown={onKeyDown}
        />
        {action}
      </div>
      <div className={`referral-filter-row ${source === 'INTERNAL' ? 'is-internal' : ''}`.trim()}>
        {children}
      </div>
    </div>
  );
}
