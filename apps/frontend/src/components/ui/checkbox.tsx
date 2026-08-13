import * as React from 'react';
import { cn } from '@/lib/utils';
import { Check, Minus } from 'lucide-react';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'checked'> {
  checked?: boolean | 'indeterminate';
  onCheckedChange?: (checked: boolean) => void;
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, onCheckedChange, checked, onClick, onChange, disabled, ...props }, ref) => {
    const isIndeterminate = checked === 'indeterminate';
    const isChecked = checked === true;
    return (
      <span className="relative inline-flex h-4 w-4 shrink-0">
        <input
          {...props}
          ref={ref}
          type="checkbox"
          checked={isChecked}
          aria-checked={isIndeterminate ? 'mixed' : isChecked}
          className={cn(
            'peer appearance-none h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-50',
            (isChecked || isIndeterminate) && 'bg-primary text-primary-foreground',
            className,
          )}
          onChange={(event) => {
            onChange?.(event);
            let nextChecked = true;
            if (isChecked || isIndeterminate) nextChecked = false;
            onCheckedChange?.(nextChecked);
          }}
          onClick={onClick}
          disabled={disabled}
        />
        {isIndeterminate && <Minus className="pointer-events-none absolute inset-0 m-auto h-3 w-3" />}
        {isChecked && <Check className="pointer-events-none absolute inset-0 m-auto h-3 w-3" />}
      </span>
    );
  },
);
Checkbox.displayName = 'Checkbox';

export { Checkbox };
