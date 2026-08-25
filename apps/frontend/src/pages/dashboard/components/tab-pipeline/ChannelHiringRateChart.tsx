import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { ChannelHiringData, CHANNEL_LABELS } from '../../types';
import {
  useChartHover,
  createVerticalBarShape,
  getCommonTooltipProps,
} from '../common/chart-effects';

export interface ChannelHiringRateChartProps {
  data: ChannelHiringData[];
}

export const ChannelHiringRateChart: React.FC<ChannelHiringRateChartProps> = ({ data }) => {
  const { activeIndex, onMouseMove, onMouseLeave } = useChartHover();

  return (
    <div className="bg-[#111827] border border-[#1f293d] rounded-xl p-4 shadow-xl flex flex-col justify-between h-full">
      <h3 className="text-xs font-bold uppercase text-white mb-2 flex items-center gap-1.5">
        <span className="w-1.5 h-3 bg-sky-500 rounded-sm"></span>
        8. KÊNH SOURCING VS TỶ LỆ HIRED
      </h3>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 15, right: 10, left: -20, bottom: 25 }}
            onMouseMove={onMouseMove}
            onMouseLeave={onMouseLeave}
          >
            <CartesianGrid stroke="#1f293d" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="channel"
              stroke="#64748b"
              tick={{ fontSize: 8.5, fill: '#94a3b8' }}
              tickFormatter={(v) => CHANNEL_LABELS[v] || v}
            />
            <YAxis
              stroke="#64748b"
              tick={{ fontSize: 9, fill: '#94a3b8' }}
              domain={[0, 60]}
              ticks={[0, 10, 20, 30, 40, 50, 60]}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip
              {...getCommonTooltipProps()}
              formatter={(value: number) => [`${value}%`, 'Tỷ lệ Hired']}
            />
            <Bar
              dataKey="rate"
              name="Tỷ lệ Hired (%)"
              radius={[3, 3, 0, 0]}
              shape={createVerticalBarShape(activeIndex, 3)}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
