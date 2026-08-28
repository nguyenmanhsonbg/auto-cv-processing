import React from 'react';
import type { PostFinalMetrics } from '@/lib/dashboard-api';

interface PostFinalMetricsCardProps {
  metrics: PostFinalMetrics;
}

const Metric = ({ label, value }: { label: string; value: number | string }) => (
  <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
    <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
    <div className="mt-1 text-xl font-bold text-slate-100">{value}</div>
  </div>
);

export const PostFinalMetricsCard: React.FC<PostFinalMetricsCardProps> = ({ metrics }) => (
  <div className="rounded-xl border border-[#1f293d] bg-[#111827] p-4 shadow-xl">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-xs font-bold uppercase tracking-wider text-white">Final Interview → Offer → Onboard</h3>
      <span className="text-[10px] text-slate-400">TTH theo ngày làm việc</span>
    </div>
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-12">
      <Metric label="Tổng Final" value={metrics.totalFinalItv} />
      <Metric label="Fail ITV" value={metrics.failItv} />
      <Metric label="Passed Đạt" value={metrics.passedDat} />
      <Metric label="Passed Tốt" value={metrics.passedTot} />
      <Metric label="Passed XS" value={metrics.passedXuatSac} />
      <Metric label="Không Offer" value={metrics.passedKhongOffer} />
      <Metric label="Tổng Offer" value={metrics.totalOffer} />
      <Metric label="Đang Offer" value={metrics.offering} />
      <Metric label="Offer Accept" value={metrics.offerAccepted} />
      <Metric label="Offer Reject" value={metrics.offerRejected} />
      <Metric label="Chờ Onboard" value={metrics.onboardingPending} />
      <Metric label="Hired" value={metrics.hired} />
      <Metric label="Onboard Reject" value={metrics.onboardRejected} />
    </div>
    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-300 md:grid-cols-6">
      <span>Final → Fail: <b>{metrics.finalToFailRate}%</b></span>
      <span>Final → Offer: <b>{metrics.finalToOfferRate}%</b></span>
      <span>Offer → Hired: <b>{metrics.offerToHiredRate}%</b></span>
      <span>Final → Hired: <b>{metrics.finalToHiredRate}%</b></span>
      <span>TT H Apply: <b>{metrics.applyToOnboardTth}d</b></span>
      <span>TT H Final: <b>{metrics.finalToOnboardTth}d</b></span>
    </div>
  </div>
);
