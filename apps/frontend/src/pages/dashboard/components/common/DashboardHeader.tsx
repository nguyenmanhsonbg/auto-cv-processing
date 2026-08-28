import React from 'react';
import { Globe, FileDown, Upload } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { DashboardScope } from '@/lib/dashboard-api';
import { DASHBOARD_SCOPE_LABELS } from '@/lib/dashboard-api';

export interface DashboardHeaderProps {
  onExportClick?: () => void;
  onImportClick?: () => void;
  asOfDate?: string;
  selectedScope?: DashboardScope;
  onScopeChange?: (scope: DashboardScope) => void;
  totalApplications?: number;
  totalHired?: number;
  totalFinalItv?: number;
}

const SCOPES: DashboardScope[] = ['company', 'owner', 'position', 'channel', 'time'];

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  onExportClick,
  onImportClick,
  asOfDate = '01/01/2026 – 11/08/2026',
  selectedScope = 'company',
  onScopeChange,
  totalApplications: _totalApplications = 0,
  totalHired: _totalHired = 0,
  totalFinalItv: _totalFinalItv = 0,
}) => {
  const handleScopeChange = (value: DashboardScope) => {
    if (onScopeChange) onScopeChange(value);
  };

  return (
    <header className="rounded-xl p-4 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 border border-rose-950/60 shadow-xl bg-gradient-to-r from-[#880816] via-[#35060b] to-[#111827]">
      {/* Left Title & Status Badges */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="h-4 w-1.5 bg-rose-500 rounded-sm inline-block shadow-sm"></span>
          <h1 className="text-base sm:text-lg md:text-xl font-black text-white tracking-wider uppercase">
            VCS HR DASHBOARD ANALYTICS
          </h1>
        </div>
        <span className="text-xs text-rose-300/90 bg-rose-950/60 px-2.5 py-0.5 rounded border border-rose-900/60 font-mono shadow-inner">
          Dữ liệu YTD {asOfDate}
        </span>

        {/* <div className="flex flex-wrap items-center gap-2 ml-0 md:ml-2 text-xs font-semibold">
          <span className="bg-black/60 border border-slate-700/70 px-2.5 py-1 rounded text-slate-300 shadow-sm">
            Ứng viên <b className="text-white font-bold">{totalApplications}</b>
          </span>
          <span className="bg-black/60 border border-slate-700/70 px-2.5 py-1 rounded text-slate-300 shadow-sm">
            Final ITV <b className="text-white font-bold">{totalFinalItv}</b>
          </span>
          <span className="bg-black/60 border border-emerald-900/80 px-2.5 py-1 rounded text-emerald-300 shadow-sm">
            Hired <b className="text-emerald-400 font-bold">{totalHired}</b>
          </span>
        </div> */}
      </div>

      {/* Right Scope & Export Buttons */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <div className="w-[180px]">
            <Select value={selectedScope} onValueChange={(value) => handleScopeChange(value as DashboardScope)}>
            <SelectTrigger className="bg-[#161f30] hover:bg-slate-800 border-slate-700 text-slate-200 h-9 text-xs focus:ring-0 focus:ring-offset-0">
              <div className="flex items-center gap-1.5 truncate">
                <Globe className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <SelectValue placeholder="Chọn phạm vi" />
              </div>
            </SelectTrigger>
            <SelectContent className="bg-[#111827] border-slate-800 text-slate-200 text-xs">
              {SCOPES.map((scope) => (
                <SelectItem key={scope} value={scope} className="cursor-pointer hover:bg-slate-800 text-xs">
                  {DASHBOARD_SCOPE_LABELS[scope]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <button
          type="button"
          onClick={onImportClick}
          className="bg-emerald-700 hover:bg-emerald-600 active:bg-emerald-800 text-white font-medium px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 shadow-md shadow-emerald-900/40 transition cursor-pointer h-9 text-xs"
        >
          <Upload className="w-3.5 h-3.5" />
          Import dữ liệu
        </button>

        <button
          type="button"
          onClick={onExportClick}
          className="bg-rose-700 hover:bg-rose-600 active:bg-rose-800 text-white font-medium px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 shadow-md shadow-rose-900/40 transition cursor-pointer h-9 text-xs"
        >
          <FileDown className="w-3.5 h-3.5" />
          Xuất Báo Cáo
        </button>
      </div>
    </header>
  );
};
