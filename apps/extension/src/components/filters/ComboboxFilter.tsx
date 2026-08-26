import { useState, useRef, useEffect } from 'react';
import { ChevronDownIcon } from '@/components/icons';

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

  return (
    <div ref={rootRef} className={`shared-filter-field ${className}`.trim()}>
      {label && <span>{label}</span>}
      <span className="shared-filter-select-control">
        <button
          type="button"
          className="shared-filter-trigger"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-expanded={isOpen}
        >
          <span className={values.length === 0 ? 'placeholder' : ''}>{displayLabel}</span>
          <ChevronDownIcon className={isOpen ? 'is-open' : ''} />
        </button>
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
                  <span className="shared-filter-checkbox">{selected ? '✓' : ''}</span>
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
