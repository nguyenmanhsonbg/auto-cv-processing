import React, { useState } from 'react';
import { adaptPipelineDashboard, PipelineDashboard, SubFilterKey } from '../../types';
import { PIPELINE_FILTER_DATASETS } from '../../data/dashboard-data';
import { PipelineSubFilterBar } from './PipelineSubFilterBar';
// import { KPICard } from '../common/KPICard';
import { RecruitmentFunnelCard } from './RecruitmentFunnelCard';
import { RecruitmentAreaTrendChart } from './RecruitmentAreaTrendChart';
// import { TimeMetricsCard } from './TimeMetricsCard';
import { PositionProgressChart } from './PositionProgressChart';
import { RecruiterPerformanceMatrix } from './RecruiterPerformanceMatrix';
import { DeptHiringRateChart } from './DeptHiringRateChart';
import { SourcingEfficiencyChart } from './SourcingEfficiencyChart';
import { FinalQualityRankChart } from './FinalQualityRankChart';
import { LevelHiredStructureChart } from './LevelHiredStructureChart';
import { SlaControlChart } from './SlaControlChart';
import { NormRadarCompareChart } from './NormRadarCompareChart';
import { OfferStatusDistributionChart } from './OfferStatusDistributionChart';
import { TthByDepartmentChart } from './TthByDepartmentChart';
import { ChannelHiringRateChart } from './ChannelHiringRateChart';

export interface PipelineTabProps {
  dashboard: PipelineDashboard;
  asOfDate?: string;
}

export const PipelineTab: React.FC<PipelineTabProps> = ({ dashboard, asOfDate }) => {
  const [subFilter, setSubFilter] = useState<SubFilterKey>('hrbp');
  const currentDataset = PIPELINE_FILTER_DATASETS[subFilter] || PIPELINE_FILTER_DATASETS.hrbp;
  const chartData = adaptPipelineDashboard(dashboard);

  return (
    <div className="space-y-6 animate-in fade-in-50 duration-300">
      {/* Sub-Filter Bar */}
      <PipelineSubFilterBar
        activeFilter={subFilter}
        onFilterChange={setSubFilter}
        asOfDate={asOfDate || '11/08/2026'}
      />

      {/* Top 4 Funnel KPI Cards */}
      {/* <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          title="Tổng Final ITV"
          value={dashboard.funnel.totalFinalItv > 0 ? dashboard.funnel.totalFinalItv : currentDataset.f1}
          borderVariant="blue"
          subtitle="Ứng viên tham gia phỏng vấn"
        />
        <KPICard
          title="Passed ITV"
          value={dashboard.funnel.passed > 0 ? dashboard.funnel.passed : currentDataset.f2}
          borderVariant="purple"
          subtitle={
            <span>
              Tỷ lệ đạt: <b className="text-purple-300">{dashboard.funnel.passedRate > 0 ? dashboard.funnel.passedRate : currentDataset.p2}%</b>
            </span>
          }
        />
        <KPICard
          title="Vòng Offer"
          value={dashboard.funnel.offer > 0 ? dashboard.funnel.offer : currentDataset.f3}
          borderVariant="amber"
          subtitle={
            <span>
              Tỷ lệ phát offer: <b className="text-amber-300">{dashboard.funnel.offerRate > 0 ? dashboard.funnel.offerRate : currentDataset.p3}%</b>
            </span>
          }
        />
        <KPICard
          title="Đã Tuyển (Hired)"
          value={dashboard.funnel.hired > 0 ? dashboard.funnel.hired : currentDataset.f5}
          borderVariant="emerald"
          subtitle={
            <span>
              Tỷ lệ chốt: <b className="text-emerald-300">{dashboard.funnel.hiredRate > 0 ? dashboard.funnel.hiredRate : currentDataset.p5}%</b>
            </span>
          }
        />
      </div> */}

      {/* Row 1: Funnel Blocks (5 cols) + Right Column: Monthly Trend Area Chart & Position Progress Chart (7 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        <div className="lg:col-span-5 flex flex-col">
          <RecruitmentFunnelCard
            title={currentDataset.title}
            funnel={dashboard.funnel}
            totalApplications={dashboard.totalApplications}
            timeMetrics={dashboard.timeMetrics}
            stageDistribution={dashboard.stageDistribution}
          />
        </div>
        <div className="lg:col-span-7 flex flex-col gap-5 justify-between">
          <RecruitmentAreaTrendChart
            data={dashboard.monthlyTrend}
            subtitle={currentDataset.subtitle}
          />
          <PositionProgressChart data={chartData.positions} />
        </div>
      </div>

      {/* Row 2: Recruiter Performance Matrix (7 cols) & Dept Hiring Rate (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7">
          <RecruiterPerformanceMatrix data={chartData.recruiters} />
        </div>
        <div className="lg:col-span-5">
          <DeptHiringRateChart data={chartData.departments} />
        </div>
      </div>

      {/* Row 3: Sourcing, Quality, Level & SLA Controls (4 columns) */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <SourcingEfficiencyChart data={chartData.sourcing} />
        <FinalQualityRankChart data={chartData.quality} />
        <LevelHiredStructureChart
          data={chartData.levelHired}
          totalHired={dashboard.totalHired}
        />
        <SlaControlChart data={chartData.sla} />
      </div>

      {/* Row 4: Norm Radar, Offer Status, TTH Dept & Sourcing Channels (4 columns) */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <NormRadarCompareChart data={chartData.normRadar} />
        <OfferStatusDistributionChart data={chartData.offerStatus} />
        <TthByDepartmentChart data={chartData.tthByDepartment} />
        <ChannelHiringRateChart data={chartData.channels} />
      </div>
    </div>
  );
};
