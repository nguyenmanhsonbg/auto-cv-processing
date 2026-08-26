import { ChevronDownIcon } from '@/components/icons';

export type SelectFilterOption = {
  value: string | number;
  label: string;
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
};

export function SelectFilter({ label, value, options, onChange, className = '', ariaLabel, disabled = false, required = false }: SelectFilterProps) {
  return (
    <label className={`shared-filter-field ${className}`.trim()}>
      <span>{label}{required ? <span className="required-mark"> *</span> : null}</span>
      <span className="shared-filter-select-control">
        <select value={value} aria-label={ariaLabel} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <ChevronDownIcon />
      </span>
    </label>
  );
}
