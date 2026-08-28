import React from 'react';

export type TrendTableMode = 'position' | 'month' | 'channel' | 'hrbp';

interface TrendModeOption {
  value: TrendTableMode;
  label: string;
}

const TREND_MODE_OPTIONS: TrendModeOption[] = [
  { value: 'position', label: 'Theo vị trí' },
  { value: 'month', label: 'Theo tháng' },
  { value: 'channel', label: 'Theo kênh tuyển dụng' },
  { value: 'hrbp', label: 'Theo HRBP & TA' },
];

export interface TrendFilterBarProps {
  selectedMode: TrendTableMode;
  onModeChange: (mode: TrendTableMode) => void;
}

export const TrendFilterBar: React.FC<Readonly<TrendFilterBarProps>> = ({
  selectedMode,
  onModeChange,
}) => (
  <fieldset className="rounded-xl border border-[#1f293d] bg-[#111827] p-4 shadow-xl">
    <legend className="sr-only">Chọn loại xu hướng cho bảng</legend>
    <div className="mb-3 flex items-center gap-2">
      <span className="h-4 w-1.5 rounded-full bg-rose-600" />
      <h2 className="text-xs font-bold uppercase tracking-wide text-white">Chọn loại xu hướng</h2>
    </div>
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {TREND_MODE_OPTIONS.map((option) => {
        const isSelected = selectedMode === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onModeChange(option.value)}
            className={`rounded-lg border px-3 py-2 text-left text-xs font-semibold transition ${isSelected
              ? 'border-rose-500 bg-rose-900/50 text-white shadow-[0_0_12px_rgba(225,29,72,0.25)]'
              : 'border-slate-700 bg-slate-950/60 text-slate-400 hover:border-slate-500 hover:text-slate-200'
              }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  </fieldset>
);
