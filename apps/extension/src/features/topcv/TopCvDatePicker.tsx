import { useState, useRef, useEffect, useMemo } from 'react';

interface TopCvDatePickerProps {
  value?: string; // Format: 'YYYY-MM-DD'
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

const MONTH_NAMES = [
  'Tháng 1',
  'Tháng 2',
  'Tháng 3',
  'Tháng 4',
  'Tháng 5',
  'Tháng 6',
  'Tháng 7',
  'Tháng 8',
  'Tháng 9',
  'Tháng 10',
  'Tháng 11',
  'Tháng 12',
];

function CalendarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="3" stroke="#2F2B3D" strokeWidth="1.5" strokeOpacity="0.85" />
      <path d="M16 2V6M8 2V6M3 10H21" stroke="#2F2B3D" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.85" />
      <circle cx="16" cy="15" r="2.2" stroke="#2F2B3D" strokeWidth="1.5" strokeOpacity="0.85" />
      <path d="M16 15V13" stroke="#2F2B3D" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.85" />
    </svg>
  );
}

function SmallChevronDown() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SmallChevronUp() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M4 10L8 6L12 10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function NavArrowLeft() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function NavArrowRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M6 12L10 8L6 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Parse YYYY-MM-DD
function parseDate(dateStr?: string): { year: number; month: number; day: number } | null {
  if (!dateStr) return null;
  const parts = dateStr.split('-');
  if (parts.length !== 3) return null;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
  return { year: y, month: m, day: d };
}

// Format to YYYY-MM-DD
function toIsoDate(year: number, month: number, day: number): string {
  const mm = String(month + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

// Format to DD/MM/YYYY for display
function toDisplayDate(dateStr?: string): string {
  const parsed = parseDate(dateStr);
  if (!parsed) return '';
  const mm = String(parsed.month + 1).padStart(2, '0');
  const dd = String(parsed.day).padStart(2, '0');
  return `${dd}/${mm}/${parsed.year}`;
}

export function TopCvDatePicker({
  value,
  onChange,
  placeholder = 'DD/MM/YYYY',
  required,
  disabled,
  className = '',
}: TopCvDatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'day' | 'month' | 'year'>('day');

  const containerRef = useRef<HTMLDivElement>(null);

  const today = useMemo(() => {
    const d = new Date();
    return {
      year: d.getFullYear(),
      month: d.getMonth(),
      day: d.getDate(),
    };
  }, []);

  const selectedDate = useMemo(() => parseDate(value), [value]);

  // Viewing month and year state
  const [viewYear, setViewYear] = useState<number>(selectedDate?.year ?? today.year);
  const [viewMonth, setViewMonth] = useState<number>(selectedDate?.month ?? today.month);

  // Pagination for Year view (24 years per page)
  const [yearPageStart, setYearPageStart] = useState<number>(() => {
    const currentYear = selectedDate?.year ?? today.year;
    return Math.floor(currentYear / 24) * 24;
  });

  // Sync viewing state when value or open changes
  useEffect(() => {
    if (selectedDate) {
      setViewYear(selectedDate.year);
      setViewMonth(selectedDate.month);
      setYearPageStart(Math.floor(selectedDate.year / 24) * 24);
    }
  }, [value, isOpen]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setViewMode('day');
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleToggle = () => {
    if (disabled) return;
    if (!isOpen) {
      setViewMode('day');
    }
    setIsOpen(!isOpen);
  };

  const handleSelectDay = (day: number, monthOffset = 0) => {
    let targetYear = viewYear;
    let targetMonth = viewMonth + monthOffset;
    if (targetMonth < 0) {
      targetMonth = 11;
      targetYear -= 1;
    } else if (targetMonth > 11) {
      targetMonth = 0;
      targetYear += 1;
    }
    const iso = toIsoDate(targetYear, targetMonth, day);
    onChange(iso);
    setIsOpen(false);
    setViewMode('day');
  };

  const handleSelectMonth = (monthIndex: number) => {
    setViewMonth(monthIndex);
    setViewMode('day');
  };

  const handleSelectYear = (year: number) => {
    setViewYear(year);
    setViewMode('month');
  };

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handlePrevYearBlock = () => {
    setYearPageStart((prev) => prev - 24);
  };

  const handleNextYearBlock = () => {
    setYearPageStart((prev) => prev + 24);
  };

  // Calendar grid calculations
  const calendarCells = useMemo(() => {
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    // Monday as first day: 0 = Monday, ..., 6 = Sunday
    const firstDayIndex = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;
    const prevMonthDaysCount = new Date(viewYear, viewMonth, 0).getDate();

    const cells: Array<{
      day: number;
      isCurrentMonth: boolean;
      monthOffset: number;
      isToday: boolean;
      isSelected: boolean;
    }> = [];

    // Previous month padding
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const d = prevMonthDaysCount - i;
      cells.push({
        day: d,
        isCurrentMonth: false,
        monthOffset: -1,
        isToday: false,
        isSelected: false,
      });
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const isToday = today.year === viewYear && today.month === viewMonth && today.day === d;
      const isSelected =
        selectedDate !== null &&
        selectedDate.year === viewYear &&
        selectedDate.month === viewMonth &&
        selectedDate.day === d;

      cells.push({
        day: d,
        isCurrentMonth: true,
        monthOffset: 0,
        isToday,
        isSelected,
      });
    }

    // Next month padding (fill up to multiple of 7, min 35 or 42)
    const totalNeeded = cells.length <= 35 ? 35 : 42;
    const remaining = totalNeeded - cells.length;
    for (let d = 1; d <= remaining; d++) {
      cells.push({
        day: d,
        isCurrentMonth: false,
        monthOffset: 1,
        isToday: false,
        isSelected: false,
      });
    }

    return cells;
  }, [viewYear, viewMonth, today, selectedDate]);

  // Year list for Year view (24 years)
  const yearsList = useMemo(() => {
    const list: number[] = [];
    for (let i = 0; i < 24; i++) {
      list.push(yearPageStart + i);
    }
    return list;
  }, [yearPageStart]);

  const displayString = toDisplayDate(value);

  return (
    <div className={`topcv-datepicker-container ${className}`} ref={containerRef}>
      {/* TRIGGER INPUT */}
      <div
        className={`topcv-datepicker-trigger ${isOpen ? 'is-focused' : ''} ${disabled ? 'is-disabled' : ''} ${displayString ? 'has-value' : ''}`}
        onClick={handleToggle}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleToggle();
          }
        }}
      >
        <span className="topcv-datepicker-icon">
          <CalendarIcon />
        </span>
        <span className={`topcv-datepicker-text ${!displayString ? 'is-placeholder' : ''}`}>
          {displayString || placeholder}
        </span>
        {required && !value && <input tabIndex={-1} className="topcv-datepicker-hidden-input" required />}
      </div>

      {/* DROPDOWN POPOVER */}
      {isOpen && (
        <div className="topcv-datepicker-popover" role="dialog" aria-modal="true">
          
          {/* ================= 1. DAY VIEW ================= */}
          {viewMode === 'day' && (
            <div className="topcv-dp-view topcv-dp-day-view">
              {/* Header */}
              <div className="topcv-dp-header">
                <div className="topcv-dp-header-selectors">
                  <button
                    type="button"
                    className="topcv-dp-selector-btn"
                    onClick={() => setViewMode('month')}
                  >
                    <span>{MONTH_NAMES[viewMonth]}</span>
                    <SmallChevronDown />
                  </button>
                  <button
                    type="button"
                    className="topcv-dp-selector-btn"
                    onClick={() => setViewMode('year')}
                  >
                    <span>{viewYear}</span>
                    <SmallChevronDown />
                  </button>
                </div>
                <div className="topcv-dp-nav-arrows">
                  <button
                    type="button"
                    className="topcv-dp-nav-btn"
                    onClick={handlePrevMonth}
                    title="Tháng trước"
                    aria-label="Tháng trước"
                  >
                    <NavArrowLeft />
                  </button>
                  <button
                    type="button"
                    className="topcv-dp-nav-btn"
                    onClick={handleNextMonth}
                    title="Tháng sau"
                    aria-label="Tháng sau"
                  >
                    <NavArrowRight />
                  </button>
                </div>
              </div>

              {/* Weekday labels */}
              <div className="topcv-dp-weekdays">
                {WEEKDAYS.map((wd) => (
                  <span key={wd} className="topcv-dp-weekday-cell">
                    {wd}
                  </span>
                ))}
              </div>

              {/* Days grid */}
              <div className="topcv-dp-days-grid">
                {calendarCells.map((cell, idx) => {
                  let cellClass = 'topcv-dp-day-cell';
                  if (!cell.isCurrentMonth) cellClass += ' is-other-month';
                  if (cell.isToday && !cell.isSelected) cellClass += ' is-today';
                  if (cell.isSelected) cellClass += ' is-selected';

                  return (
                    <button
                      key={idx}
                      type="button"
                      className={cellClass}
                      onClick={() => handleSelectDay(cell.day, cell.monthOffset)}
                    >
                      {cell.day}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ================= 2. MONTH VIEW ================= */}
          {viewMode === 'month' && (
            <div className="topcv-dp-view topcv-dp-month-view">
              {/* Header */}
              <div className="topcv-dp-header">
                <span className="topcv-dp-title">Chọn tháng</span>
                <button
                  type="button"
                  className="topcv-dp-selector-btn"
                  onClick={() => setViewMode('year')}
                >
                  <span>{viewYear}</span>
                  <SmallChevronUp />
                </button>
              </div>

              {/* Months 3x4 Grid */}
              <div className="topcv-dp-months-grid">
                {MONTH_NAMES.map((name, idx) => {
                  const isCurrent = today.year === viewYear && today.month === idx;
                  const isSelected = selectedDate?.year === viewYear && selectedDate?.month === idx;
                  const isPast = viewYear < today.year || (viewYear === today.year && idx < today.month);

                  let cellClass = 'topcv-dp-month-cell';
                  if (isSelected) cellClass += ' is-selected';
                  else if (isCurrent) cellClass += ' is-current';
                  else if (isPast) cellClass += ' is-past';

                  return (
                    <button
                      key={name}
                      type="button"
                      className={cellClass}
                      onClick={() => handleSelectMonth(idx)}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ================= 3. YEAR VIEW ================= */}
          {viewMode === 'year' && (
            <div className="topcv-dp-view topcv-dp-year-view">
              {/* Header */}
              <div className="topcv-dp-header">
                <span className="topcv-dp-title">Chọn năm</span>
                <div className="topcv-dp-nav-arrows">
                  <button
                    type="button"
                    className="topcv-dp-nav-btn"
                    onClick={handlePrevYearBlock}
                    title="24 năm trước"
                    aria-label="24 năm trước"
                  >
                    <NavArrowLeft />
                  </button>
                  <button
                    type="button"
                    className="topcv-dp-nav-btn"
                    onClick={handleNextYearBlock}
                    title="24 năm sau"
                    aria-label="24 năm sau"
                  >
                    <NavArrowRight />
                  </button>
                </div>
              </div>

              {/* Years 4x6 Grid */}
              <div className="topcv-dp-years-grid">
                {yearsList.map((y) => {
                  const isCurrent = today.year === y;
                  const isSelected = selectedDate?.year === y;
                  const isPast = y < today.year;

                  let cellClass = 'topcv-dp-year-cell';
                  if (isSelected) cellClass += ' is-selected';
                  else if (isCurrent) cellClass += ' is-current';
                  else if (isPast) cellClass += ' is-past';

                  return (
                    <button
                      key={y}
                      type="button"
                      className={cellClass}
                      onClick={() => handleSelectYear(y)}
                    >
                      {y}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
