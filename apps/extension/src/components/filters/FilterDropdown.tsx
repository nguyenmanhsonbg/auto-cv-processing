import { useEffect, useMemo, useRef } from 'react';

export type FilterDropdownOption<Value extends string> = {
  value: Value;
  label: string;
};

type FilterDropdownProps<Value extends string> = {
  label: string;
  value: Value;
  options: FilterDropdownOption<Value>[];
  isOpen: boolean;
  onToggle: () => void;
  onSelect: (value: Value) => void;
  onClose?: () => void;
  className?: string;
  labelClassName?: string;
  triggerClassName?: string;
  menuClassName?: string;
  optionClassName?: string;
  disabled?: boolean;
};

export function FilterDropdown<Value extends string>({
  label,
  value,
  options,
  isOpen,
  onToggle,
  onSelect,
  onClose,
  className = '',
  labelClassName = 'cv-filter-label',
  triggerClassName = 'cv-filter-trigger',
  menuClassName = 'cv-filter-menu',
  optionClassName = 'cv-filter-option',
  disabled = false,
}: FilterDropdownProps<Value>) {
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const selectedLabel = useMemo(() => options.find((option) => option.value === value)?.label ?? options[0]?.label ?? '', [options, value]);

  useEffect(() => {
    if (!isOpen || !onClose) return undefined;
    const handlePointerDown = (event: PointerEvent) => {
      if (!dropdownRef.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isOpen, onClose]);

  return (
    <div ref={dropdownRef} className={`cv-filter-dropdown ${className}${isOpen ? ' is-open' : ''}`.trim()}>
      <span className={labelClassName}>{label}</span>
      <button type="button" className={triggerClassName} aria-haspopup="listbox" aria-expanded={isOpen} disabled={disabled} onClick={onToggle}>
        <span>{selectedLabel}</span>
        <svg aria-hidden="true" viewBox="0 0 16 16" fill="none"><path d="m3.5 6 4.5 4.5L12.5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {isOpen ? (
        <div className={menuClassName} role="listbox" aria-label={label}>
          {options.map((option) => (
            <button key={option.value} type="button" role="option" aria-selected={option.value === value} className={`${optionClassName}${option.value === value ? ' is-selected' : ''}`} onClick={() => onSelect(option.value)}>
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
