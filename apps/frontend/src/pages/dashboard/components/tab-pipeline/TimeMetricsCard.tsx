import React from 'react';
import { TimeMetrics } from '../../types';
import { KPICard } from '../common/KPICard';

export interface TimeMetricsCardProps {
  timeMetrics: TimeMetrics;
  totalHired: number;
}

export const TimeMetricsCard: React.FC<TimeMetricsCardProps> = ({
  timeMetrics,
  totalHired,
}) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KPICard
        title="Time to Hire (Apply → Hired)"
        value={`${timeMetrics.avgTimeToHire}d`}
        borderVariant="blue"
        subtitle="Ngày trung bình từ ứng tuyển đến nhận việc"
      />
      <KPICard
        title="TTH (Final → Hired)"
        value={`${timeMetrics.avgTimeFromFinal}d`}
        borderVariant="purple"
        subtitle="Ngày trung bình từ PV cuối đến nhận việc"
      />
      <KPICard
        title="TTH (Offer → Hired)"
        value={`${timeMetrics.avgTimeOfferToHire}d`}
        borderVariant="amber"
        subtitle="Ngày trung bình từ phát offer đến nhận việc"
      />
      <KPICard
        title="Đã Tuyển YTD"
        value={totalHired}
        borderVariant="emerald"
        subtitle="Tổng số nhân sự đã onboard thành công"
      />
    </div>
  );
};
