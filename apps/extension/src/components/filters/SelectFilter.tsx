import { ChevronDownIcon } from '@/components/icons';

export type SelectFilterOption = {
  value: string | number;
  label: string;
  disabled?: boolean;
};

type SelectFilterProps = {
  label: string;
  value: string | number;
  options: SelectFilterOption[];
  onChange: (value: string | number) => void;
  className?: string;
  ariaLabel?: string;
  disabled?: boolean;
  required?: boolean;
  error?: string | null;
  onBlur?: () => void;
};

export function SelectFilter({ label, value, options, onChange, className = '', ariaLabel, disabled = false, required = false, error = null, onBlur }: SelectFilterProps) {
  const hasError = Boolean(error);
  return (
    <label className={`shared-filter-field ${className} ${hasError ? 'has-error' : ''}`.trim()}>
      <span>{label}{required ? <span className="required-mark"> *</span> : null}</span>
      <span className="shared-filter-select-control">
        <select
          value={value}
          aria-label={ariaLabel}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          aria-invalid={hasError}
        >
          {options.map((option) => {
            const isPlaceholder = Boolean(option.disabled || option.value === '' || (option.value === 0 && option.label.startsWith('Chọn')));
            return (
              <option key={option.value} value={option.value} disabled={isPlaceholder} hidden={isPlaceholder}>
                {option.label}
              </option>
            );
          })}
        </select>
        <ChevronDownIcon />
      </span>
      {hasError ? <span className="input-field-error">{error}</span> : null}
    </label>
  );
}
