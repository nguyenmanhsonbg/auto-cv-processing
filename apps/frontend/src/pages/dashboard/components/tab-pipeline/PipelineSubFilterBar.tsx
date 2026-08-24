import React from 'react';
import { SubFilterKey } from '../../types';

export interface PipelineSubFilterBarProps {
  activeFilter: SubFilterKey;
  onFilterChange: (key: SubFilterKey) => void;
  asOfDate?: string;
}

const SUB_FILTERS: { key: SubFilterKey; label: string }[] = [
  { key: 'hrbp', label: 'Theo HRBP & TA' },
  { key: 'vitri', label: 'Theo Vị trí' },
  { key: 'kenh', label: 'Theo Kênh tuyển dụng' },
  { key: 'thoigian', label: 'Theo Thời gian' },
];

export const PipelineSubFilterBar: React.FC<PipelineSubFilterBarProps> = ({
  activeFilter,
  onFilterChange,
  asOfDate = '11/8/2026',
}) => {
  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
      <div className="flex items-center gap-2">
        <span className="w-1.5 h-4 bg-rose-600 rounded-full"></span>
        <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wide text-white">
          PIPELINE TUYỂN DỤNG & ĐÁNH GIÁ CHUYỂN ĐỔI CHUẨN (NORM 10/6/3/1)
        </h2>
        <span className="text-xs text-slate-500 font-mono">- Cập nhật: {asOfDate}</span>
      </div>

      <div className="flex items-center gap-1 text-xs font-medium bg-[#0f172a] p-1 rounded-lg border border-slate-800">
        {SUB_FILTERS.map((filter) => {
          const isActive = activeFilter === filter.key;
          return (
            <button
              key={filter.key}
              type="button"
              onClick={() => onFilterChange(filter.key)}
              className={`px-3 py-1 rounded transition cursor-pointer ${
                isActive
                  ? 'bg-[#e11d48] text-white font-semibold shadow-[0_0_10px_rgba(225,29,72,0.4)]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {filter.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};
