import React from 'react';
import { ChevronDown } from 'lucide-react';
import {
  StageCount,
  PipelineFunnel,
  TimeMetrics,
  STAGE_LABELS,
  STAGE_COLORS,
} from '../../types';

export interface RecruitmentFunnelCardProps {
  stageDistribution?: StageCount[];
  totalApplications?: number;
  funnel?: PipelineFunnel;
  timeMetrics?: TimeMetrics;
  title?: string;
  cr?: string;
  fail?: string | number;
  reject?: string | number;
  tth1?: string;
  tth2?: string;
}

export const RecruitmentFunnelCard: React.FC<RecruitmentFunnelCardProps> = ({
  stageDistribution = [],
  totalApplications = 0,
  funnel,
  timeMetrics,
  title = 'PHỄU TUYỂN DỤNG (THEO STAGE)',
  cr,
  fail,
  reject,
  tth1,
  tth2,
}) => {
  const funnelStageKeys = Object.keys(STAGE_LABELS).filter(
    (stageKey) => !['REJECTED', 'TALENT_POOL'].includes(stageKey),
  );

  // Map of backend stage counts
  const stageMap = new Map<string, StageCount>();
  stageDistribution.forEach((s) => stageMap.set(s.stage, s));

  // Render every known stage so an empty stage remains visible as 0.
  const stagesToRender = funnelStageKeys.map((stageKey) => {
    const stage = stageMap.get(stageKey);
    return {
      stageKey,
      label: STAGE_LABELS[stageKey],
      count: stage?.count ?? 0,
      percentage: stage?.percentage ?? 0,
      color: STAGE_COLORS[stageKey] || '#3b82f6',
    };
  });

  // Calculate percentage width: decreasing smoothly from 88% down to 45%
  const totalStages = Math.max(stagesToRender.length, 1);

  const getWidthStyle = (index: number): React.CSSProperties => {
    if (totalStages === 1) return { width: '85%' };
    const percent = Math.round(88 - index * ((88 - 45) / (totalStages - 1)));
    return { width: `${percent}%` };
  };

  // Summary footer calculations
  const rejectedCount = stageMap.get('REJECTED')?.count ?? fail ?? 0;
  const offerRevisedCount = stageMap.get('OFFER_REVISED')?.count ?? reject ?? 0;
  const displayTth1 = timeMetrics ? `${timeMetrics.avgTimeToHire}d` : tth1 ?? '—';
  const displayTth2 = timeMetrics ? `${timeMetrics.avgTimeFromFinal}d` : tth2 ?? '—';

  const hiredStageCount = stageMap.get('HIRED')?.count ?? funnel?.hired ?? 0;
  const totalAppsCount = totalApplications ?? 0;
  const conversionRate = cr ?? `Tỷ lệ: ${totalAppsCount > 0 ? Math.round((hiredStageCount / totalAppsCount) * 100) : 0}%`;

  return (
    <div className="bg-[#111827] border border-[#1f293d] rounded-xl p-5 shadow-xl flex flex-col justify-between h-full">
      <div>
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <span className="text-xs font-bold uppercase text-slate-400 tracking-wider">
            {title}
          </span>
          <span className="text-[11px] text-emerald-400 bg-emerald-950/60 border border-emerald-800 px-2.5 py-0.5 rounded font-mono">
            {conversionRate}
          </span>
        </div>

        {/* Dynamic Funnel Blocks mapped according to STAGE_LABELS */}
        <div className="flex flex-col items-center space-y-1.5 py-1">
          {stagesToRender.map((stageItem, index) => {
            const isLast = index === stagesToRender.length - 1;

            return (
              <div key={stageItem.stageKey} className="w-full flex flex-col items-center">
                <div className="w-full flex items-center justify-between gap-2">
                  <div className="flex-1 flex justify-center">
                    <div
                      style={{
                        ...getWidthStyle(index),
                        backgroundColor: `${stageItem.color}1c`,
                        borderColor: `${stageItem.color}66`,
                      }}
                      className="border text-xs font-semibold py-2 px-3 rounded-lg text-center shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 cursor-pointer"
                    >
                      <span
                        className="font-bold mr-1.5"
                        style={{ color: stageItem.color }}
                      >
                        {stageItem.count}
                      </span>
                      <span className="text-slate-200">{stageItem.label}</span>
                    </div>
                  </div>
                  <div className="w-20 text-[11px] text-right font-bold text-slate-300 font-mono shrink-0">
                    {stageItem.percentage}% tổng
                  </div>
                </div>

                {!isLast && (
                  <div className="w-full flex items-center justify-between gap-2 py-0.5">
                    <div className="flex-1 flex justify-center">
                      <ChevronDown className="w-3.5 h-3.5 text-slate-600" />
                    </div>
                    <div className="w-20 shrink-0" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom Summary Stats */}
      <div className="grid grid-cols-4 gap-2 pt-4 mt-4 border-t border-slate-800 text-center text-xs">
        <div>
          <span className="text-slate-500 text-[11px] block">Fail ITV</span>
          <p className="font-bold text-rose-500 text-base mt-0.5">{rejectedCount}</p>
        </div>
        <div>
          <span className="text-slate-500 text-[11px] block">Reject Offer</span>
          <p className="font-bold text-rose-500 text-base mt-0.5">{offerRevisedCount}</p>
        </div>
        <div>
          <span className="text-slate-500 text-[11px] block">TTH (Apply)</span>
          <p className="font-bold text-purple-400 text-base mt-0.5">{displayTth1}</p>
        </div>
        <div>
          <span className="text-slate-500 text-[11px] block">TTH (Final)</span>
          <p className="font-bold text-blue-400 text-base mt-0.5">{displayTth2}</p>
        </div>
      </div>
    </div>
  );
};
