import React from 'react';
import { DashboardTab } from '../../types';

export interface DashboardTabNavProps {
  activeTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
}

const TABS: { id: DashboardTab; label: string }[] = [
  { id: 'tab-tangmoi', label: '1. Theo dõi Tăng mới' },
  { id: 'tab-pipeline', label: '2. Pipeline Tuyển dụng' },
  { id: 'tab-dinhbien', label: '3. Quản lý Nhu cầu & Định biên 2026' },
];

export const DashboardTabNav: React.FC<DashboardTabNavProps> = ({
  activeTab,
  onTabChange,
}) => {
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs md:text-sm font-semibold scrollbar-none">
      {TABS.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`px-5 py-2.5 rounded-lg border transition whitespace-nowrap cursor-pointer ${
              isActive
                ? 'bg-[#e11d48] text-white border-[#f43f5e] shadow-[0_0_15px_rgba(225,29,72,0.45)] font-bold'
                : 'bg-[#141b2d] hover:bg-slate-800 hover:text-slate-200 text-slate-400 border-slate-800'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
};
