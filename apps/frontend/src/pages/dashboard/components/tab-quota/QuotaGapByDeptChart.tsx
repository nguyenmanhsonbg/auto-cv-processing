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
import { QuotaDeptGapData } from '../../types';
import {
  useChartHover,
  createVerticalBarShape,
  ChartTooltip,
} from '../common/chart-effects';

export interface QuotaGapByDeptChartProps {
  data: QuotaDeptGapData[];
}

export const QuotaGapByDeptChart: React.FC<QuotaGapByDeptChartProps> = ({ data }) => {
  const { activeIndex, onMouseMove, onMouseLeave } = useChartHover();

  return (
    <div className="bg-[#111827] border border-[#1f293d] rounded-xl p-4 shadow-xl flex flex-col justify-between h-full">
      <h3 className="text-xs font-bold uppercase text-white mb-3 flex items-center gap-1.5">
        <span className="w-1.5 h-3 bg-purple-500 rounded-sm"></span>
        Định Biên vs Thực Tế Theo Khối
      </h3>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 15, right: 10, left: -20, bottom: 0 }}
            onMouseMove={onMouseMove}
            onMouseLeave={onMouseLeave}
          >
            <CartesianGrid stroke="#1f293d" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="dept" stroke="#64748b" tick={{ fontSize: 9, fill: '#94a3b8' }} />
            <YAxis stroke="#64748b" tick={{ fontSize: 9, fill: '#94a3b8' }} />
            <Tooltip
              cursor={false}
              content={
                <ChartTooltip
                  valueFormatter={(value) => `${value} nhân sự`}
                />
              }
            />
            <Legend wrapperStyle={{ fontSize: '10px' }} iconSize={8} />
            <Bar
              dataKey="targetNc"
              name="Nhu Cầu Định Biên (NC)"
              fill="#334155"
              radius={[4, 4, 0, 0]}
              shape={createVerticalBarShape(activeIndex, 4)}
            />
            <Bar
              dataKey="actualHc"
              name="Hiện Diện Thực Tế (HC)"
              fill="#3b82f6"
              radius={[4, 4, 0, 0]}
              shape={createVerticalBarShape(activeIndex, 4)}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
