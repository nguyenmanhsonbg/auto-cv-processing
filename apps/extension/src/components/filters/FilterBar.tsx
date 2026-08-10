import type { PropsWithChildren } from 'react';

type FilterBarProps = PropsWithChildren<{ className?: string }>;

export function FilterBar({ children, className = '' }: FilterBarProps) {
  return <div className={`shared-filter-bar ${className}`.trim()}>{children}</div>;
}
