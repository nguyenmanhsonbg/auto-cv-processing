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

function getMultiSelectLabel(
  options: MultiSelectOption[],
  selected: string[],
  allSelected: boolean,
  placeholder: string,
) {
  if (selected.length === 0 || allSelected) return placeholder;
  if (selected.length === 1) {
    return options.find((option) => option.value === selected[0])?.label ?? selected[0];
  }
  return `${selected.length} selected`;
}

export function MultiSelect({ options, selected, onChange, placeholder = 'Select…', className }: MultiSelectProps) {
  const [open, setOpen] = useState(false);

  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  };

  const allSelected = selected.length === options.length;

  const label = getMultiSelectLabel(options, selected, allSelected, placeholder);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="relative">
        <PopoverTrigger asChild>
          <Button variant="outline" className={cn('justify-between font-normal h-9 px-3 pr-14', className)}>
            <span className="truncate text-sm">{label}</span>
            <ChevronDown className="h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        {selected.length > 0 && !allSelected && (
          <button
            type="button"
            aria-label="Clear selected options"
            onClick={(event) => { event.stopPropagation(); onChange([]); }}
            className="absolute right-8 top-1/2 -translate-y-1/2 rounded-sm opacity-50 hover:opacity-100"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
      <PopoverContent
        className="p-1"
        style={{ minWidth: 'var(--radix-popover-trigger-width)' }}
        align="start"
      >
        {options.map((option) => (
          <div
            key={option.value}
            className="flex items-center gap-2 px-2 py-1.5 rounded-sm cursor-pointer hover:bg-accent text-sm"
          >
            <Checkbox
              checked={selected.includes(option.value)}
              onCheckedChange={() => toggle(option.value)}
              onClick={(e) => e.stopPropagation()}
            />
            <button
              type="button"
              className="flex-1 p-0 text-left"
              aria-label={option.label}
              aria-pressed={selected.includes(option.value)}
              onClick={() => toggle(option.value)}
            >
              {option.label}
            </button>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}
