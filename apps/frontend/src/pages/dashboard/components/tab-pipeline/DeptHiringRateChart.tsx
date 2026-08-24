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
import {
  useChartHover,
  createVerticalBarShape,
  getCommonTooltipProps,
} from '../common/chart-effects';

export interface DeptHiringRateChartProps {
  data: { dept: string; rate: number; color: string }[];
}

export const DeptHiringRateChart: React.FC<DeptHiringRateChartProps> = ({ data }) => {
  const { activeIndex, onMouseMove, onMouseLeave } = useChartHover();

  return (
    <div className="bg-[#111827] border border-[#1f293d] rounded-xl p-4 shadow-xl flex flex-col justify-between h-full">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-xs font-bold uppercase text-white flex items-center gap-1.5">
          <span className="w-1.5 h-3 bg-emerald-500 rounded-sm"></span>
          TỶ LỆ TUYỂN DỤNG THEO ĐƠN VỊ (%)
        </h3>
        <span className="text-[10px] text-slate-400 font-mono">Tỷ lệ lấp đầy Target</span>
      </div>

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
            <YAxis
              stroke="#64748b"
              tick={{ fontSize: 9, fill: '#94a3b8' }}
              tickFormatter={(v) => `${v}%`}
              domain={[0, 100]}
              ticks={[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]}
            />
            <Tooltip
              {...getCommonTooltipProps()}
              formatter={(value: number) => [`${value}%`, 'Tỷ lệ đạt chỉ tiêu']}
            />
            <Bar
              dataKey="rate"
              name="Tỷ lệ đạt (%)"
              radius={[4, 4, 0, 0]}
              shape={createVerticalBarShape(activeIndex, 4)}
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
