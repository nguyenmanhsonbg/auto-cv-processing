import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SortOrder = 'ASC' | 'DESC';

interface SortableHeaderProps {
  label: string;
  field: string;
  sortBy: string;
  sortOrder: SortOrder;
  onSort: (field: string, order: SortOrder) => void;
  className?: string;
}

export function SortableHeader({ label, field, sortBy, sortOrder, onSort, className }: SortableHeaderProps) {
  const isActive = sortBy === field;

  const handleClick = () => {
    if (!isActive) {
      onSort(field, 'ASC');
    } else {
      onSort(field, sortOrder === 'ASC' ? 'DESC' : 'ASC');
    }
  };

  return (
    <button
      className={cn('flex items-center gap-1 hover:text-foreground transition-colors whitespace-nowrap', isActive ? 'text-foreground' : 'text-muted-foreground', className)}
      onClick={handleClick}
    >
      {label}
      {isActive ? (
        sortOrder === 'ASC' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
      ) : (
        <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
      )}
    </button>
  );
}
