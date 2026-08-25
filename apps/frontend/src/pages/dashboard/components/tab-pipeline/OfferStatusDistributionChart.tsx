import React from 'react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { OfferStatusData, OFFER_STATUS_LABELS } from '../../types';
import {
  useChartHover,
  renderActiveDonutShape,
  getCommonTooltipProps,
} from '../common/chart-effects';

export interface OfferStatusDistributionChartProps {
  data: OfferStatusData[];
}

export const OfferStatusDistributionChart: React.FC<OfferStatusDistributionChartProps> = ({ data }) => {
  const { activeIndex, onPieEnter, onMouseLeave } = useChartHover();
  const total = data.reduce((sum, item) => sum + item.count, 0);

  const localizedData = data.map((item) => ({
    ...item,
    displayStatus: OFFER_STATUS_LABELS[item.status] || item.status,
  }));

  return (
    <div className="bg-[#111827] border border-[#1f293d] rounded-xl p-4 shadow-xl flex flex-col justify-between h-full">
      <h3 className="text-xs font-bold uppercase text-white mb-1 flex items-center gap-1.5">
        <span className="w-1.5 h-3 bg-teal-500 rounded-sm"></span>
        6. PHÂN BỔ TRẠNG THÁI OFFER
      </h3>
      <div className="h-64 w-full flex items-center justify-center">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={localizedData}
              dataKey="count"
              nameKey="displayStatus"
              cx="50%"
              cy="45%"
              innerRadius={50}
              outerRadius={75}
              paddingAngle={2}
              activeIndex={activeIndex !== null ? activeIndex : undefined}
              activeShape={renderActiveDonutShape}
              onMouseEnter={onPieEnter}
              onMouseLeave={onMouseLeave}
            >
              {localizedData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} stroke="#0f172a" strokeWidth={1.5} />
              ))}
            </Pie>
            <Tooltip
              {...getCommonTooltipProps()}
              formatter={(value: number, name: string) => [
                `${value} offer (${((value / total) * 100).toFixed(1)}%)`,
                name,
              ]}
            />
            <Legend
              wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }}
              iconSize={8}
              layout="horizontal"
              verticalAlign="bottom"
              align="center"
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
