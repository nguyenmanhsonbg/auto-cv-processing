import React from 'react';
import { KPICard } from '../common/KPICard';
import { QuotaGapByDeptChart } from './QuotaGapByDeptChart';
import { LevelFillRateChart } from './LevelFillRateChart';
import { QuotaForecastChart } from './QuotaForecastChart';
import {
  QUOTA_DEPT_GAP_DATA,
  QUOTA_LEVEL_FILL_DATA,
  QUOTA_FORECAST_DATA,
} from '../../data/dashboard-data';

export const QuotaTab: React.FC = () => {
  return (
    <div className="space-y-5 animate-in fade-in-50 duration-300">
      {/* Header Title */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-4 bg-purple-500 rounded-full"></span>
          <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wide text-white">
            QUẢN LÝ NHU CẦU ĐỊNH BIÊN & TỶ LỆ ĐẢM BẢO NGUỒN LỰC 2026
          </h2>
        </div>
      </div>

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          title="Nhu Cầu Định Biên (NC)"
          value="1.037"
          valueColor="text-white"
          borderVariant="blue"
          subtitle="Target BGĐ duyệt"
        />
        <KPICard
          title="Hiện Diện Thực Tế (HC)"
          value="695"
          borderVariant="emerald"
          subtitle={
            <span>
              Đảm bảo: <b className="text-emerald-400 font-semibold">68.8%</b>
            </span>
          }
        />
        <KPICard
          title="Khoảng Trống Tuyển (Gap)"
          value="342"
          borderVariant="rose"
          subtitle={<span className="text-rose-400 font-medium">Cần tuyển bổ sung</span>}
        />
        <KPICard
          title="Giải Ngân Quỹ Lương"
          value="64.2%"
          borderVariant="amber"
          subtitle="Tiết kiệm 4.6% vs ngân sách"
        />
      </div>

      {/* 3 Quota Charts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <QuotaGapByDeptChart data={QUOTA_DEPT_GAP_DATA} />
        <LevelFillRateChart data={QUOTA_LEVEL_FILL_DATA} />
        <QuotaForecastChart data={QUOTA_FORECAST_DATA} />
      </div>
    </div>
  );
};
