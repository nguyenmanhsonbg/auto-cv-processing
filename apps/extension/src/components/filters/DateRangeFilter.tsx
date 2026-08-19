import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarIcon } from '@/components/icons';

export type DateRangeValue = {
  from: string;
  to: string;
};

type DateRangeFilterProps = {
  label?: string;
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  className?: string;
};

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTH_NAMES = [
  'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
  'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12',
];

export function DateRangeFilter({ label = 'Thời gian', value, onChange, className = '' }: DateRangeFilterProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => getInitialMonth(value));

  useEffect(() => {
    if (!isOpen) return undefined;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isOpen]);

  const nextMonth = addMonths(visibleMonth, 1);
  const classes = `shared-filter-field shared-filter-date-range ${className}`.trim();
  const hasValue = Boolean(value.from || value.to);

  function selectDate(date: Date) {
    const selected = toInputValue(date);
    if (!value.from || value.to || selected < value.from) {
      onChange({ from: selected, to: '' });
      return;
    }
    onChange({ from: value.from, to: selected });
  }

  return (
    <div ref={rootRef} className={classes}>
      <span>{label}</span>
      <button
        type="button"
        className="shared-filter-date-range-control"
        aria-label={`Chọn ${label.toLowerCase()}`}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span className={`shared-filter-date-range-value ${!hasValue ? 'is-placeholder' : ''}`}>
          {formatDateRange(value)}
        </span>
        <div className="shared-filter-date-range-icons">
          {hasValue ? (
            <span
              role="button"
              tabIndex={0}
              className="shared-filter-date-range-clear-btn"
              aria-label="Xóa bộ lọc thời gian"
              onClick={(e) => {
                e.stopPropagation();
                onChange({ from: '', to: '' });
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.stopPropagation();
                  onChange({ from: '', to: '' });
                }
              }}
            >
              ×
            </span>
          ) : null}
          <CalendarIcon />
        </div>
      </button>
      {isOpen ? (
        <div className="shared-filter-date-range-popup" role="dialog" aria-label="Chọn khoảng thời gian">
          <div className="shared-filter-date-range-popup-header">
            <button
              type="button"
              className="shared-filter-date-range-nav is-previous"
              aria-label="Tháng trước"
              onClick={() => setVisibleMonth(addMonths(visibleMonth, -1))}
            >
              ‹
            </button>
            <div className="shared-filter-date-range-months">
              <CalendarMonth month={visibleMonth} value={value} onSelect={selectDate} />
              <CalendarMonth month={nextMonth} value={value} onSelect={selectDate} />
            </div>
            <button
              type="button"
              className="shared-filter-date-range-nav is-next"
              aria-label="Tháng sau"
              onClick={() => setVisibleMonth(addMonths(visibleMonth, 1))}
            >
              ›
            </button>
          </div>
          {hasValue ? (
            <div className="shared-filter-date-range-footer">
              <button
                type="button"
                className="shared-filter-date-range-reset-action"
                onClick={() => {
                  onChange({ from: '', to: '' });
                  setIsOpen(false);
                }}
              >
                Đặt lại thời gian
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

type CalendarMonthProps = {
  month: Date;
  value: DateRangeValue;
  onSelect: (date: Date) => void;
};

function CalendarMonth({ month, value, onSelect }: CalendarMonthProps) {
  const days = useMemo(() => getCalendarDays(month), [month]);
  return (
    <section className="shared-filter-calendar-month" aria-label={`${MONTH_NAMES[month.getMonth()]} ${month.getFullYear()}`}>
      <h3>{MONTH_NAMES[month.getMonth()]} {month.getFullYear()}</h3>
      <div className="shared-filter-calendar-weekdays">
        {WEEKDAYS.map((weekday) => <span key={weekday}>{weekday}</span>)}
      </div>
      <div className="shared-filter-calendar-days">
        {days.map((day, index) => {
          const inputValue = day ? toInputValue(day) : '';
          const isSelected = inputValue === value.from || inputValue === value.to;
          const isInRange = Boolean(day && value.from && value.to && inputValue > value.from && inputValue < value.to);
          return day ? (
            <button
              key={inputValue}
              type="button"
              className={`${isSelected ? 'is-selected ' : ''}${isInRange ? 'is-in-range' : ''}`.trim()}
              aria-label={formatAccessibleDate(day)}
              aria-pressed={isSelected}
              onClick={() => onSelect(day)}
            >
              {day.getDate()}
            </button>
          ) : <span key={`empty-${index}`} aria-hidden="true" />;
        })}
      </div>
    </section>
  );
}

function getCalendarDays(month: Date) {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const days: Array<Date | null> = Array.from({ length: firstDay.getDay() }, () => null);
  for (let day = 1; day <= daysInMonth; day += 1) days.push(new Date(month.getFullYear(), month.getMonth(), day));
  return days;
}

function getInitialMonth(value: DateRangeValue) {
  const source = value.from || value.to;
  const date = source ? parseInputValue(source) : new Date();
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(value: Date, amount: number) {
  return new Date(value.getFullYear(), value.getMonth() + amount, 1);
}

function parseInputValue(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function toInputValue(value: Date) {
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function formatAccessibleDate(value: Date) {
  return `${value.getDate()}/${value.getMonth() + 1}/${value.getFullYear()}`;
}

function formatDateRange(value: DateRangeValue) {
  const from = formatDate(value.from);
  const to = formatDate(value.to);
  return `${from || 'dd/mm/yyyy'} - ${to || 'dd/mm/yyyy'}`;
}

function formatDate(value: string) {
  if (!value) return '';
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}
