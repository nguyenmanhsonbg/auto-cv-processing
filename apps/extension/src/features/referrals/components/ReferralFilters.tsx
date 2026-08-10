import type { PropsWithChildren, ReactNode } from 'react';
import { FilterBar, SearchField } from '@/components/filters';
import { SearchIcon } from '@/components/icons';

type ReferralFiltersProps = PropsWithChildren<{
  source: 'INTERNAL' | 'FREELANCER';
  search: string;
  onSearchChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
  action?: ReactNode;
  clearButton?: ReactNode;
}>;

export function ReferralFilters({ source, search, onSearchChange, placeholder, ariaLabel, action, clearButton, children }: ReferralFiltersProps) {
  return (
    <FilterBar className={`referral-toolbar${source === 'INTERNAL' ? ' is-internal' : ''}`}>
      <SearchField
        className="referral-search-field"
        value={search}
        onChange={onSearchChange}
        placeholder={placeholder}
        ariaLabel={ariaLabel}
        leading={<SearchIcon />}
        clearButton={clearButton}
      />
      {action}
      <div className={`referral-filter-row${source === 'INTERNAL' ? ' is-internal' : ''}`}>
        {children}
      </div>
    </FilterBar>
  );
}
