import { useEffect, useMemo, useRef } from 'react';
import { ChevronDownIcon } from '@/components/icons';

export type MultiSelectFilterOption = { value: string; label: string; meta?: string };

type MultiSelectFilterProps = {
  label: string;
  values: string[];
  options: MultiSelectFilterOption[];
  allLabel?: string;
  isOpen: boolean;
  onToggle: () => void;
  onClose?: () => void;
  onChange: (values: string[]) => void;
  className?: string;
};

export function MultiSelectFilter({ label, values, options, allLabel = 'Tất cả', isOpen, onToggle, onClose, onChange, className = '' }: MultiSelectFilterProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const allSelected = values.length === 0;
  const selectedLabel = useMemo(() => getMultiSelectLabel(allSelected, allLabel, options, values), [allLabel, allSelected, options, values]);

  useEffect(() => {
    if (!isOpen || !onClose) return undefined;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isOpen, onClose]);

  function toggleValue(value: string) {
    onChange(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
  }

  return (
    <div ref={rootRef} className={`shared-filter-multi-select ${className}`.trim()}>
      <span className="shared-filter-multi-select-label">{label}</span>
      <button type="button" className="referral-jd-select-trigger" aria-haspopup="listbox" aria-expanded={isOpen} onClick={onToggle}>
        <span>{selectedLabel}</span>
        <ChevronDownIcon className={isOpen ? 'is-open' : ''} />
      </button>
      {isOpen ? (
        <div className="referral-jd-options" role="listbox" aria-label={label}>
          <button type="button" role="option" aria-selected={allSelected} className={`referral-jd-option${allSelected ? ' is-selected' : ''}`} onClick={() => onChange([])}>
            <span className="referral-jd-option-label"><span className={`referral-jd-checkbox${allSelected ? ' is-checked' : ''}`} aria-hidden="true">✓</span><span>{allLabel}</span></span>
          </button>
          {options.map((option) => {
            const selected = values.includes(option.value);
            return (
              <button key={option.value} type="button" role="option" aria-selected={selected} className={`referral-jd-option${selected ? ' is-selected' : ''}`} onClick={() => toggleValue(option.value)}>
                <span className="referral-jd-option-label"><span className={`referral-jd-checkbox${selected ? ' is-checked' : ''}`} aria-hidden="true">✓</span><span>{option.label}</span></span>
                {option.meta ? <time>{option.meta}</time> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function getMultiSelectLabel(
  allSelected: boolean,
  allLabel: string,
  options: MultiSelectFilterOption[],
  values: string[],
) {
  if (allSelected) return allLabel;
  if (values.length === 1) return options.find((option) => option.value === values[0])?.label ?? '1 mục';
  return `${values.length} mục đã chọn`;
}
