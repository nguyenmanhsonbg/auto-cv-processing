import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MultiSelectOption {
  value: string;
  label: string;
}

interface MultiSelectProps {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  className?: string;
}

export function MultiSelect({ options, selected, onChange, placeholder = 'Select…', className }: MultiSelectProps) {
  const [open, setOpen] = useState(false);

  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  };

  const allSelected = selected.length === options.length;

  const label =
    selected.length === 0 || allSelected
      ? placeholder
      : selected.length === 1
      ? (options.find((o) => o.value === selected[0])?.label ?? selected[0])
      : `${selected.length} selected`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn('justify-between font-normal h-9 px-3', className)}>
          <span className="truncate text-sm">{label}</span>
          <div className="flex items-center gap-1 ml-2 shrink-0">
            {selected.length > 0 && !allSelected && (
              <span
                role="button"
                onClick={(e) => { e.stopPropagation(); onChange([]); }}
                className="rounded-sm opacity-50 hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </span>
            )}
            <ChevronDown className="h-4 w-4 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-1"
        style={{ minWidth: 'var(--radix-popover-trigger-width)' }}
        align="start"
      >
        {options.map((option) => (
          <div
            key={option.value}
            className="flex items-center gap-2 px-2 py-1.5 rounded-sm cursor-pointer hover:bg-accent text-sm"
            onClick={() => toggle(option.value)}
          >
            <Checkbox
              checked={selected.includes(option.value)}
              onCheckedChange={() => toggle(option.value)}
              onClick={(e) => e.stopPropagation()}
            />
            <span>{option.label}</span>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}
