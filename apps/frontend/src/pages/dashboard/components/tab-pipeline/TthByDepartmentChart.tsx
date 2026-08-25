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
import { TthDeptData } from '../../types';
import {
  useChartHover,
  createVerticalBarShape,
  getCommonTooltipProps,
} from '../common/chart-effects';

export interface TthByDepartmentChartProps {
  data: TthDeptData[];
}

export const TthByDepartmentChart: React.FC<TthByDepartmentChartProps> = ({ data }) => {
  const { activeIndex, onMouseMove, onMouseLeave } = useChartHover();

  return (
    <div className="bg-[#111827] border border-[#1f293d] rounded-xl p-4 shadow-xl flex flex-col justify-between h-full">
      <h3 className="text-xs font-bold uppercase text-white mb-2 flex items-center gap-1.5">
        <span className="w-1.5 h-3 bg-indigo-500 rounded-sm"></span>
        7. TTH THEO ĐƠN VỊ (APPLY VS FINAL)
      </h3>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 25, right: 10, left: -20, bottom: 25 }}
            onMouseMove={onMouseMove}
            onMouseLeave={onMouseLeave}
          >
            <CartesianGrid stroke="#1f293d" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="dept" stroke="#64748b" tick={{ fontSize: 8.5, fill: '#94a3b8' }} />
            <YAxis
              stroke="#64748b"
              tick={{ fontSize: 9, fill: '#94a3b8' }}
              domain={[0, 50]}
              ticks={[0, 10, 20, 30, 40]}
              tickFormatter={(v) => `${v}`}
            />
            <Tooltip
              {...getCommonTooltipProps()}
              formatter={(value: number) => [`${value} ngày`]}
            />
            <Legend
              wrapperStyle={{ fontSize: '10.5px', paddingBottom: '12px' }}
              iconSize={8}
              verticalAlign="top"
              align="center"
            />
            <Bar
              dataKey="applyTth"
              name="Từ Ngày Apply"
              fill="#a855f7"
              radius={[3, 3, 0, 0]}
              shape={createVerticalBarShape(activeIndex, 3)}
            />
            <Bar
              dataKey="finalTth"
              name="Từ Final ITV"
              fill="#38bdf8"
              radius={[3, 3, 0, 0]}
              shape={createVerticalBarShape(activeIndex, 3)}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
