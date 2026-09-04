import { useState, useRef, useEffect } from 'react';
import { ChevronDownIcon, ChevronUpIcon, ClockIcon } from '@/assets/icons';

interface TopCvTimePickerProps {
  value?: string; // Format: 'HH:mm' e.g. '08:30'
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  align?: 'left' | 'right';
}

function parseTime(val?: string): { hour: number; minute: number } {
  if (!val) return { hour: 8, minute: 30 };
  const parts = val.split(':');
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  return {
    hour: isNaN(h) ? 8 : Math.max(0, Math.min(23, h)),
    minute: isNaN(m) ? 30 : Math.max(0, Math.min(59, m)),
  };
}

function formatTime(hour: number, minute: number): string {
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function TopCvTimePicker({
  value = '08:30',
  onChange,
  placeholder = '08:30',
  disabled = false,
  className = '',
  align = 'left',
}: TopCvTimePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { hour, minute } = parseTime(value);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
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
    setIsOpen(!isOpen);
  };

  const incrementHour = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextHour = (hour + 1) % 24;
    onChange(formatTime(nextHour, minute));
  };

  const decrementHour = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextHour = (hour - 1 + 24) % 24;
    onChange(formatTime(nextHour, minute));
  };

  const incrementMinute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextMinute = (minute + 1) % 60;
    onChange(formatTime(hour, nextMinute));
  };

  const decrementMinute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextMinute = (minute - 1 + 60) % 60;
    onChange(formatTime(hour, nextMinute));
  };

  return (
    <div className={`topcv-timepicker-container ${className}`} ref={containerRef}>
      {/* TRIGGER INPUT */}
      <div
        className={`topcv-timepicker-trigger ${isOpen ? 'is-focused' : ''} ${disabled ? 'is-disabled' : ''}`}
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
        <span className="topcv-timepicker-text">
          {value || placeholder}
        </span>
        <span className="topcv-timepicker-icon">
          <ClockIcon />
        </span>
      </div>

      {/* TIME PICKER POPOVER */}
      {isOpen && (
        <div
          className={`topcv-timepicker-popover ${align === 'right' ? 'align-right' : ''}`}
          role="dialog"
          aria-modal="true"
        >
          {/* HOUR COLUMN */}
          <div className="topcv-tp-col">
            <button
              type="button"
              className="topcv-tp-arrow-btn"
              onClick={incrementHour}
              aria-label="Tăng giờ"
            >
              <ChevronUpIcon />
            </button>
            <div className="topcv-tp-val">
              {hour}
            </div>
            <button
              type="button"
              className="topcv-tp-arrow-btn"
              onClick={decrementHour}
              aria-label="Giảm giờ"
            >
              <ChevronDownIcon />
            </button>
          </div>

          {/* SEPARATOR */}
          <div className="topcv-tp-sep-col">
            <span className="topcv-tp-sep">:</span>
          </div>

          {/* MINUTE COLUMN */}
          <div className="topcv-tp-col">
            <button
              type="button"
              className="topcv-tp-arrow-btn"
              onClick={incrementMinute}
              aria-label="Tăng phút"
            >
              <ChevronUpIcon />
            </button>
            <div className="topcv-tp-val">
              {String(minute).padStart(2, '0')}
            </div>
            <button
              type="button"
              className="topcv-tp-arrow-btn"
              onClick={decrementMinute}
              aria-label="Giảm phút"
            >
              <ChevronDownIcon />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
