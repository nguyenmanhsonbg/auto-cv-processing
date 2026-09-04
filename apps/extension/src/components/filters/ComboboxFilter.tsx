import { useState, useRef, useEffect, type KeyboardEvent, type MouseEvent } from 'react';
import { ChevronDownIcon, CloseIcon } from '@/assets/icons';

export type ComboboxOption = {
  value: string | number;
  label: string;
};

export type ComboboxValue = { value: number; label: string };

type ComboboxFilterProps = {
  label: string;
  values: ComboboxValue[];
  options: ComboboxOption[];
  onChange: (values: ComboboxValue[]) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loading?: boolean;
  placeholder?: string;
  className?: string;
};

export function ComboboxFilter({
  label,
  values,
  options,
  onChange,
  onLoadMore,
  hasMore = false,
  loading = false,
  placeholder = 'Chọn...',
  className = '',
}: ComboboxFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || !onLoadMore || !hasMore) return;
    const handleScroll = () => {
      if (!listRef.current || loading) return;
      const { scrollTop, scrollHeight, clientHeight } = listRef.current;
      if (scrollTop + clientHeight >= scrollHeight - 50) {
        onLoadMore();
      }
    };
    const list = listRef.current;
    list?.addEventListener('scroll', handleScroll);
    return () => list?.removeEventListener('scroll', handleScroll);
  }, [isOpen, onLoadMore, hasMore, loading]);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isOpen]);

  const toggleValue = (option: ComboboxOption) => {
    const exists = values.find((v) => v.value === option.value);
    if (exists) {
      onChange(values.filter((v) => v.value !== option.value));
    } else {
      onChange([...values, { value: option.value as number, label: option.label }]);
    }
  };

  const displayLabel = values.length === 0
    ? placeholder
    : values.length === 1
      ? values[0].label
      : `${values.length} mục đã chọn`;

  const removeValue = (event: MouseEvent | KeyboardEvent, value: number) => {
    event.stopPropagation();
    onChange(values.filter((item) => item.value !== value));
  };

  const clearAll = (event: MouseEvent | KeyboardEvent) => {
    event.stopPropagation();
    onChange([]);
  };

  return (
    <div ref={rootRef} className={`shared-filter-field combobox-filter ${className}`.trim()}>
      {label && <span>{label}</span>}
      <span className="shared-filter-select-control">
        <div
          role="combobox"
          tabIndex={0}
          className="shared-filter-trigger"
          title={values.map((value) => value.label).join(', ')}
          onClick={() => setIsOpen((prev) => !prev)}
          aria-expanded={isOpen}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setIsOpen((prev) => !prev);
            }
          }}
        >
          <div className="shared-filter-chips-container">
            {values.length === 0 ? (
              <span className="placeholder">{displayLabel}</span>
            ) : (
              values.map((value) => (
                <span key={value.value} className="shared-filter-chip" title={value.label}>
                  <span>{value.label}</span>
                  <button
                    type="button"
                    className="shared-filter-chip-remove"
                    aria-label={`Xóa ${value.label}`}
                    onClick={(event) => removeValue(event, value.value)}
                  >
                    <CloseIcon />
                  </button>
                </span>
              ))
            )}
          </div>
          <div className="shared-filter-trigger-actions">
            {values.length > 0 ? (
              <button
                type="button"
                className="shared-filter-clear-btn"
                aria-label="Xóa tất cả"
                title="Xóa tất cả"
                onClick={clearAll}
              >
                <CloseIcon />
              </button>
            ) : null}
            <ChevronDownIcon className={isOpen ? 'is-open' : ''} />
          </div>
        </div>
        {isOpen && (
          <div ref={listRef} className="shared-filter-dropdown" role="listbox">
            {options.map((option) => {
              const selected = values.some((v) => v.value === option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`shared-filter-option${selected ? ' is-selected' : ''}`}
                  onClick={() => toggleValue(option)}
                >
                  <span>{option.label}</span>
                </button>
              );
            })}
            {loading && <div className="shared-filter-loading">Đang tải...</div>}
          </div>
        )}
      </span>
    </div>
  );
}
