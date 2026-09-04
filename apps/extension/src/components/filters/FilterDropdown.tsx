import { useEffect, useMemo, useRef } from 'react';
import { ChevronDownIcon } from '@/assets/icons';

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
  menuVariant?: 'native' | 'custom';
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
  menuVariant = 'native',
  disabled = false,
}: FilterDropdownProps<Value>) {
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const visibleOptions = useMemo(() => {
    if (menuVariant !== 'custom') return options;

    const seenValues = new Set<Value>();
    return options.filter((option) => {
      if (seenValues.has(option.value)) return false;
      seenValues.add(option.value);
      return true;
    });
  }, [menuVariant, options]);
  const selectedLabel = useMemo(() => visibleOptions.find((option) => option.value === value)?.label ?? visibleOptions[0]?.label ?? '', [value, visibleOptions]);

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
      <button type="button" className={triggerClassName} aria-expanded={isOpen} disabled={disabled} onClick={onToggle}>
        <span>{selectedLabel}</span>
        <ChevronDownIcon className={isOpen ? 'is-open' : ''} />
      </button>
      {isOpen && menuVariant === 'custom' ? (
        <div className={menuClassName} aria-label={label} role="listbox">
          {visibleOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={`${optionClassName}${option.value === value ? ' is-selected' : ''}`}
              disabled={disabled}
              onClick={() => onSelect(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
      {isOpen && menuVariant === 'native' ? (
        <select
          className={menuClassName}
          aria-label={label}
          value={value}
          size={Math.max(1, Math.min(visibleOptions.length, 6))}
          disabled={disabled}
          onChange={(event) => onSelect(event.currentTarget.value as Value)}
        >
          {visibleOptions.map((option) => (
            <option key={option.value} value={option.value} className={`${optionClassName}${option.value === value ? ' is-selected' : ''}`}>
              {option.label}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  );
}
