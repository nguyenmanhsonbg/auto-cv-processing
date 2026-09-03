import { useEffect, useMemo, useRef, type MouseEvent, type KeyboardEvent } from 'react';
import { ChevronDownIcon, CloseIcon } from '@/components/icons';

export type MultiSelectFilterOption = { value: string | number; label: string; meta?: string };

export function getMultiSelectPlaceholder(placeholder?: string, allLabel?: string): string {
  return placeholder?.trim() || allLabel?.trim() || '';
}

export function toggleMultiSelectValue(values: string[], value: string | null): string[] {
  if (value === null) return [];
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

export function toggleMultiSelectOption(
  values: (string | number)[],
  value: string | number,
  optionValues: (string | number)[],
  allSelected = false,
): (string | number)[] {
  if (allSelected) {
    return optionValues.filter((optionValue) => optionValue !== value);
  }

  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

type MultiSelectFilterProps = {
  readonly label: string;
  readonly values: (string | number)[];
  readonly options: MultiSelectFilterOption[];
  readonly allLabel?: string;
  readonly allSelected?: boolean;
  readonly onAllSelectedChange?: (selected: boolean) => void;
  readonly placeholder?: string;
  readonly isOpen: boolean;
  readonly onToggle: () => void;
  readonly onClose?: () => void;
  readonly onChange: (values: (string | number)[]) => void;
  readonly className?: string;
  readonly required?: boolean;
  readonly error?: string | null;
  readonly maxValues?: number;
  readonly maxValuesNotice?: string;
};

export function MultiSelectFilter({
  label,
  values,
  options,
  allLabel,
  allSelected,
  onAllSelectedChange,
  placeholder,
  isOpen,
  onToggle,
  onClose,
  onChange,
  className = '',
  required = false,
  error = null,
  maxValues,
  maxValuesNotice,
}: MultiSelectFilterProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const placeholderText = getMultiSelectPlaceholder(placeholder, allLabel);
  const optionValues = useMemo(() => options.map((option) => option.value), [options]);
  const isAllSelected = Boolean(allLabel) && (allSelected ?? values.length === 0);

  useEffect(() => {
    if (!isOpen || !onClose) return undefined;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isOpen, onClose]);

  function toggleValue(value: string | number) {
    const selected = isAllSelected || values.includes(value);
    if (!selected && maxValues != null && values.length >= maxValues) return;
    if (isAllSelected) onAllSelectedChange?.(false);
    onChange(toggleMultiSelectOption(values, value, optionValues, isAllSelected));
  }

  function removeValue(e: MouseEvent | KeyboardEvent, value: string | number) {
    e.stopPropagation();
    onChange(values.filter((item) => item !== value));
  }

  function clearAll(e: MouseEvent | KeyboardEvent) {
    e.stopPropagation();
    if (allLabel && onAllSelectedChange) {
      onAllSelectedChange(true);
      return;
    }
    onChange([]);
  }

  const selectedOptions = useMemo(() => {
    return values.map((val) => {
      const match = options.find((opt) => opt.value === val);
      return match ?? { value: val, label: String(val) };
    });
  }, [options, values]);

  const hasError = Boolean(error);
  return (
    <div ref={rootRef} className={`shared-filter-multi-select${allLabel ? ' has-all-option' : ''} ${className} ${hasError ? 'has-error' : ''}`.trim()}>
      {label ? <span className="shared-filter-multi-select-label">{label}{required ? <span className="required-mark"> *</span> : null}</span> : null}
      <div
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        tabIndex={0}
        title={selectedOptions.map((option) => option.label).join(', ')}
        className={`shared-filter-multi-select-trigger referral-jd-select-trigger${isOpen ? ' is-open' : ''}`}
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
        <div className={`referral-jd-options${allLabel ? ' has-all-option' : ''}`} role="group" aria-label={label}>
          {maxValues != null && values.length >= maxValues ? (
            <div className="shared-filter-max-notice">
              {maxValuesNotice || `Chọn tối đa ${maxValues} lựa chọn, xóa bớt và chọn lại lựa chọn bạn muốn`}
            </div>
          ) : null}
          {allLabel ? (
            <label className={`referral-jd-option shared-filter-all-option${isAllSelected ? ' is-selected' : ''}`}>
              <input
                type="checkbox"
                className="referral-jd-option-input"
                checked={isAllSelected}
                onChange={() => {
                  if (onAllSelectedChange) {
                    onAllSelectedChange(!isAllSelected);
                    return;
                  }
                  onChange([]);
                }}
              />
              <span aria-hidden="true" className={`referral-jd-checkbox${isAllSelected ? ' is-checked' : ''}`}>
                {isAllSelected ? '✓' : ''}
              </span>
              <span className="referral-jd-option-label">
                <span className="referral-jd-option-content">
                  <span className="referral-jd-option-title">{allLabel}</span>
                </span>
              </span>
            </label>
          ) : null}
          <div className={`referral-jd-option-list${allLabel ? ' is-scrollable' : ''}`}>
            {options.map((option) => {
              const selected = isAllSelected || values.includes(option.value);
              const isDisabled = !selected && maxValues != null && values.length >= maxValues;
              return (
                <label
                  key={option.value}
                  className={`referral-jd-option${selected ? ' is-selected' : ''}${option.meta ? ' has-meta' : ''}${isDisabled ? ' is-disabled' : ''}`}
                >
                  <input
                    type="checkbox"
                    className="referral-jd-option-input"
                    checked={selected}
                    disabled={isDisabled}
                    onChange={() => toggleValue(option.value)}
                  />
                  {allLabel ? (
                    <span aria-hidden="true" className={`referral-jd-checkbox${selected ? ' is-checked' : ''}`}>
                      {selected ? '✓' : ''}
                    </span>
                  ) : null}
                  <span className="referral-jd-option-label">
                    <span className="referral-jd-option-content">
                      <span className="referral-jd-option-title">{option.label}</span>
                      {option.meta ? <time className="referral-jd-option-meta">{option.meta}</time> : null}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      ) : null}
      {hasError ? <span className="input-field-error">{error}</span> : null}
    </div>
  );
}
