import React from 'react';
import { KPICard } from '../common/KPICard';
import { MonthlyFlowChart } from './MonthlyFlowChart';
import { SourceStructureChart } from './SourceStructureChart';
import { TorByDepartmentChart } from './TorByDepartmentChart';
import {
  GROWTH_FLOW_DATA,
  GROWTH_SOURCE_DATA,
  DEPARTMENT_TOR_DATA,
} from '../../data/dashboard-data';

export const GrowthTab: React.FC = () => {
  return (
    <div className="space-y-5 animate-in fade-in-50 duration-300">
      {/* Title */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-4 bg-emerald-500 rounded-full"></span>
          <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wide text-white">
            THEO DÕI TĂNG MỚI & BIẾN ĐỘNG NHÂN SỰ 2026
          </h2>
        </div>
      </div>

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          title="Tổng Tăng Mới YTD"
          value="+128"
          borderVariant="emerald"
          subtitle="96 Tuyển mới + 32 Luân chuyển"
        />
        <KPICard
          title="Tổng Giảm (Nghỉ việc)"
          value="-54"
          borderVariant="rose"
          subtitle={
            <span>
              TOR YTD: <b className="text-rose-300 font-semibold">12.7%</b>
            </span>
          }
        />
        <KPICard
          title="Tăng Trưởng Thuần (Net)"
          value="+74"
          borderVariant="blue"
          subtitle={<span className="text-emerald-400 font-medium">+11.9% quy mô</span>}
        />
        <KPICard
          title="Đạt Thử Việc (60D)"
          value="91.4%"
          borderVariant="amber"
          subtitle="85/93 nhân sự đạt"
        />
      </div>

      {/* 3 Deep Analysis Charts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <MonthlyFlowChart data={GROWTH_FLOW_DATA} />
        <SourceStructureChart data={GROWTH_SOURCE_DATA} />
        <TorByDepartmentChart data={DEPARTMENT_TOR_DATA} />
      </div>
    </div>
  );
};
