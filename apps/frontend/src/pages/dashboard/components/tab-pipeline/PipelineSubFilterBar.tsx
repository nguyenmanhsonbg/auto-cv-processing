import React from 'react';
import { CHANNEL_LABELS, SubFilterKey } from '../../types';
import type { DashboardOwnerOption } from '@/lib/dashboard-api';

const RECRUITMENT_CHANNELS = ['VCS_PORTAL', 'FACEBOOK', 'TOPCV', 'ITVIEC', 'VIETNAMWORKS', 'LINKEDIN', 'MANUAL', 'OTHER'];

export interface PipelineSubFilterBarProps {
  activeFilter: SubFilterKey;
  onFilterChange: (key: SubFilterKey) => void;
  asOfDate?: string;
  selectedChannel?: string;
  onChannelChange?: (channel: string) => void;
  ownerOptions?: DashboardOwnerOption[];
  selectedOwnerId?: string;
  onOwnerChange?: (owner?: DashboardOwnerOption) => void;
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
  selectedChannel,
  onChannelChange,
  ownerOptions = [],
  selectedOwnerId,
  onOwnerChange,
}) => {
  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
      <div className="flex items-center gap-2">
        <span className="w-1.5 h-4 bg-rose-600 rounded-full"></span>
        <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wide text-white">
          PIPELINE TUYỂN DỤNG & ĐÁNH GIÁ CHUYỂN ĐỔI
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
              className={`px-3 py-1 rounded transition cursor-pointer ${isActive
                  ? 'bg-[#e11d48] text-white font-semibold shadow-[0_0_10px_rgba(225,29,72,0.4)]'
                  : 'text-slate-400 hover:text-white'
                }`}
            >
              {filter.label}
            </button>
          );
        })}
        {activeFilter === 'kenh' && onChannelChange && (
          <select
            aria-label="Lọc theo kênh tuyển dụng"
            value={selectedChannel || ''}
            onChange={(event) => onChannelChange(event.target.value)}
            className="ml-1 rounded bg-slate-800 px-2 py-1 text-slate-200 outline-none"
          >
            <option value="">Tất cả kênh</option>
            {RECRUITMENT_CHANNELS.map((channel) => (
              <option key={channel} value={channel}>{CHANNEL_LABELS[channel] || channel}</option>
            ))}
          </select>
        )}
        {activeFilter === 'hrbp' && onOwnerChange && (
          <select
            aria-label="Lọc theo HR, freelancer hoặc internal"
            value={selectedOwnerId || ''}
            onChange={(event) => onOwnerChange(ownerOptions.find((owner) => owner.id === event.target.value))}
            className="ml-1 max-w-[240px] rounded bg-slate-800 px-2 py-1 text-slate-200 outline-none"
          >
            <option value="">Tất cả người phụ trách</option>
            {ownerOptions.map((owner) => (
              <option key={`${owner.type}-${owner.id}`} value={owner.id}>{owner.label}</option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
};
