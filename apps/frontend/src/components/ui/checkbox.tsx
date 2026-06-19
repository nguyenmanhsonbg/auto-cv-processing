import * as React from 'react';
import { cn } from '@/lib/utils';
import { Check, Minus } from 'lucide-react';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'checked'> {
  checked?: boolean | 'indeterminate';
  onCheckedChange?: (checked: boolean) => void;
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, onCheckedChange, checked, onClick, ...props }, _ref) => {
    const isIndeterminate = checked === 'indeterminate';
    const isChecked = checked === true;
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={isIndeterminate ? 'mixed' : !!checked}
        className={cn(
          'peer h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          (isChecked || isIndeterminate) && 'bg-primary text-primary-foreground',
          className,
        )}
        onClick={(e) => {
          onClick?.(e as unknown as React.MouseEvent<HTMLInputElement>);
          onCheckedChange?.(isChecked ? false : isIndeterminate ? false : true);
        }}
        disabled={props.disabled}
      >
        {isIndeterminate && <Minus className="h-3 w-3 mx-auto" />}
        {isChecked && <Check className="h-3 w-3 mx-auto" />}
      </button>
    );
  },
);
Checkbox.displayName = 'Checkbox';

export { Checkbox };
