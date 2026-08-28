import React, { useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import type { DashboardTrends, TrendDimension } from '@/lib/dashboard-api';
import { PostFinalMetricsCard } from '../tab-pipeline/PostFinalMetricsCard';
import { TrendDimensionChart } from './TrendDimensionChart';
import { TrendFilterBar, TrendTableMode } from './TrendFilterBar';
import { TrendTable } from './TrendTable';

export interface TrendTabProps {
  trends: DashboardTrends | null;
  loading: boolean;
  error: string | null;
}

const MODE_COPY: Record<TrendTableMode, { title: string; dimensionLabel: string }> = {
  position: { title: 'Xu hướng tuyển dụng theo vị trí', dimensionLabel: 'Vị trí' },
  month: { title: 'Xu hướng tuyển dụng theo tháng', dimensionLabel: 'Tháng' },
  channel: { title: 'Xu hướng tuyển dụng theo kênh tuyển dụng', dimensionLabel: 'Kênh tuyển dụng' },
  hrbp: { title: 'Xu hướng tuyển dụng theo HRBP & TA', dimensionLabel: 'HRBP & TA' },
};

const CHANNEL_LABELS: Record<string, string> = {
  VCS_PORTAL: 'VCS Portal',
  FACEBOOK: 'Facebook',
  TOPCV: 'TopCV',
  ITVIEC: 'ITViec',
  VIETNAMWORKS: 'VietnamWorks',
  LINKEDIN: 'LinkedIn',
  MANUAL: 'Thủ công',
  OTHER: 'Khác',
  UNKNOWN: 'Không xác định',
};

function getTableRows(trends: DashboardTrends, mode: TrendTableMode): TrendDimension[] {
  switch (mode) {
    case 'month':
      return trends.byMonthTable;
    case 'channel':
      return trends.byChannel.map((row) => ({ ...row, label: CHANNEL_LABELS[row.label] ?? row.label }));
    case 'hrbp':
      return trends.byRecruiter;
    case 'position':
    default:
      return trends.byPosition;
  }
}

export const TrendTab: React.FC<Readonly<TrendTabProps>> = ({
  trends,
  loading,
  error,
}) => {
  const [selectedMode, setSelectedMode] = useState<TrendTableMode>('position');

  if (loading && !trends) {
    return (
      <div className="flex min-h-64 items-center justify-center rounded-xl border border-slate-800 bg-[#111827] text-sm text-slate-400">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Đang tải xu hướng tuyển dụng...
      </div>
    );
  }

  if (error && !trends) {
    return (
      <div role="alert" className="flex min-h-32 items-center justify-center rounded-xl border border-rose-900/60 bg-[#111827] p-6 text-sm text-rose-300">
        <AlertCircle className="mr-2 h-4 w-4" /> {error}
      </div>
    );
  }

  if (!trends) return null;

  return (
    <div className="space-y-5 animate-in fade-in-50 duration-300">
      <div>
        <h1 className="text-lg font-bold uppercase tracking-wide text-white">Xu hướng tuyển dụng</h1>
        <p className="mt-1 text-xs text-slate-400">Theo dõi kết quả theo vị trí, tháng, HRBP/TA và kênh tuyển dụng.</p>
      </div>

      <TrendFilterBar
        selectedMode={selectedMode}
        onModeChange={setSelectedMode}
      />

      <PostFinalMetricsCard metrics={trends.summary} />

      <TrendTable
        total={trends.total}
        rows={getTableRows(trends, selectedMode)}
        title={MODE_COPY[selectedMode].title}
        dimensionLabel={MODE_COPY[selectedMode].dimensionLabel}
      />

      {/* <RecruitmentAreaTrendChart
        data={trends.byMonth}
        subtitle="Số lượng sự kiện phát sinh theo tháng trong khoảng thời gian đã chọn"
      /> */}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <TrendDimensionChart
          title="Xu hướng tuyển dụng theo HRBP / TA"
          subtitle="So sánh Final ITV, Offer và Hired theo người phụ trách"
          data={trends.byRecruiter}
        />
        <TrendDimensionChart
          title="Xu hướng tuyển dụng theo kênh"
          subtitle="So sánh Final ITV, Offer và Hired theo nguồn ứng viên"
          data={trends.byChannel}
        />
      </div>
    </div>
  );
};

export default TrendTab;
