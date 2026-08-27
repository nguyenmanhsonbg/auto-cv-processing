import { useEffect, useMemo, useRef, type MouseEvent, type KeyboardEvent } from 'react';
import { ChevronDownIcon, CloseIcon } from '@/components/icons';

export type MultiSelectFilterOption = { value: string | number; label: string; meta?: string };

export function toggleMultiSelectValue(values: string[], value: string | null): string[] {
  if (value === null) return [];
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

type MultiSelectFilterProps = {
  readonly label: string;
  readonly values: (string | number)[];
  readonly options: MultiSelectFilterOption[];
  readonly allLabel?: string;
  readonly placeholder?: string;
  readonly isOpen: boolean;
  readonly onToggle: () => void;
  readonly onClose?: () => void;
  readonly onChange: (values: (string | number)[]) => void;
  readonly className?: string;
  readonly required?: boolean;
};

export function MultiSelectFilter({
  label,
  values,
  options,
  allLabel = 'Tất cả',
  placeholder,
  isOpen,
  onToggle,
  onClose,
  onChange,
  className = '',
  required = false,
}: MultiSelectFilterProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const allSelected = values.length === 0;
  const placeholderText = placeholder ?? allLabel;

  useEffect(() => {
    if (!isOpen || !onClose) return undefined;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isOpen, onClose]);

  function toggleValue(value: string | number) {
    onChange(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
  }

  function removeValue(e: MouseEvent | KeyboardEvent, value: string | number) {
    e.stopPropagation();
    onChange(values.filter((item) => item !== value));
  }

  function clearAll(e: MouseEvent | KeyboardEvent) {
    e.stopPropagation();
    onChange([]);
  }

  const selectedOptions = useMemo(() => {
    return values.map((val) => {
      const match = options.find((opt) => opt.value === val);
      return match ?? { value: val, label: String(val) };
    });
  }, [options, values]);

  return (
    <div ref={rootRef} className={`shared-filter-multi-select ${className}`.trim()}>
      {label ? <span className="shared-filter-multi-select-label">{label}{required ? <span className="required-mark"> *</span> : null}</span> : null}
      <div
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        tabIndex={0}
        title={selectedOptions.map((option) => option.label).join(', ')}
        className="shared-filter-multi-select-trigger referral-jd-select-trigger"
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
      >
        <div className="shared-filter-chips-container">
          {selectedOptions.length === 0 ? (
            <span className="shared-filter-placeholder">{placeholderText}</span>
          ) : (
            selectedOptions.map((opt) => (
              <span key={opt.value} className="shared-filter-chip" title={opt.label}>
                <span>{opt.label}</span>
                <button
                  type="button"
                  aria-label={`Xóa ${opt.label}`}
                  className="shared-filter-chip-remove"
                  onClick={(e) => removeValue(e, opt.value)}
                >
                  <CloseIcon />
                </button>
              </span>
            ))
          )}
        </div>
        <div className="shared-filter-trigger-actions">
          {selectedOptions.length > 0 ? (
            <button
              type="button"
              aria-label="Xóa tất cả"
              title="Xóa tất cả"
              className="shared-filter-clear-btn"
              onClick={clearAll}
            >
              <CloseIcon />
            </button>
          ) : null}
          <ChevronDownIcon className={isOpen ? 'is-open' : ''} />
        </div>
      </div>
      {isOpen ? (
        <div className="referral-jd-options" role="group" aria-label={label}>
          <label className={`referral-jd-option${allSelected ? ' is-selected' : ''}`}>
            <input
              type="checkbox"
              className="referral-jd-option-input"
              checked={allSelected}
              onChange={() => onChange([])}
            />
            <span className="referral-jd-option-label"><span className={`referral-jd-checkbox${allSelected ? ' is-checked' : ''}`} aria-hidden="true">✓</span><span>{allLabel}</span></span>
          </label>
          {options.map((option) => {
            const selected = values.includes(option.value);
            return (
              <label key={option.value} className={`referral-jd-option${selected ? ' is-selected' : ''}${option.meta ? ' has-meta' : ''}`}>
                <input
                  type="checkbox"
                  className="referral-jd-option-input"
                  checked={selected}
                  onChange={() => toggleValue(option.value)}
                />
                <span className="referral-jd-option-label">
                  <span className={`referral-jd-checkbox${selected ? ' is-checked' : ''}`} aria-hidden="true">✓</span>
                  <span className="referral-jd-option-content">
                    <span className="referral-jd-option-title">{option.label}</span>
                    {option.meta ? <time className="referral-jd-option-meta">{option.meta}</time> : null}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
