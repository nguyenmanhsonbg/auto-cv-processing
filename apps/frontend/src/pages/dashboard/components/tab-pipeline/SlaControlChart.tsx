import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { SlaStageData, SLA_STAGE_LABELS } from '../../types';
import {
  useChartHover,
  createVerticalBarShape,
  getCommonTooltipProps,
} from '../common/chart-effects';

export interface SlaControlChartProps {
  data: SlaStageData[];
}

export const SlaControlChart: React.FC<SlaControlChartProps> = ({ data }) => {
  const { activeIndex, onMouseMove, onMouseLeave } = useChartHover();

  return (
    <div className="bg-[#111827] border border-[#1f293d] rounded-xl p-4 shadow-xl flex flex-col justify-between h-full">
      <h3 className="text-xs font-bold uppercase text-white mb-2 flex items-center gap-1.5">
        <span className="w-1.5 h-3 bg-rose-500 rounded-sm"></span>
        4. KIỂM SOÁT SLA TỪNG VÒNG
      </h3>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 25, right: 10, left: -20, bottom: 20 }}
            onMouseMove={onMouseMove}
            onMouseLeave={onMouseLeave}
          >
            <CartesianGrid stroke="#1f293d" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="stage"
              stroke="#64748b"
              tick={{ fontSize: 8.5, fill: '#94a3b8' }}
              tickFormatter={(v) => SLA_STAGE_LABELS[v] || v}
            />
            <YAxis
              stroke="#64748b"
              tick={{ fontSize: 9, fill: '#94a3b8' }}
              domain={[0, 10]}
              ticks={[0, 2, 4, 6, 8, 10]}
            />
            <Tooltip
              {...getCommonTooltipProps()}
              formatter={(value: number) => [`${value} ngày`]}
            />
            {data.some((item) => item.standard !== null) && <Legend
              wrapperStyle={{ fontSize: '10.5px', paddingBottom: '12px' }}
              iconSize={8}
              verticalAlign="top"
              align="center"
            />}
            {data.some((item) => item.standard !== null) && <Bar
              dataKey="standard"
              name="SLA Chuẩn"
              fill="#475569"
              radius={[3, 3, 0, 0]}
              shape={createVerticalBarShape(activeIndex, 3)}
            />}
            <Bar
              dataKey="actual"
              name="Thực tế"
              fill="#f43f5e"
              radius={[3, 3, 0, 0]}
              shape={createVerticalBarShape(activeIndex, 3)}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
