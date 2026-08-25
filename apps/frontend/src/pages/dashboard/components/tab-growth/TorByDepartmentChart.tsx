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
import { DepartmentTorData } from '../../types';
import {
  useChartHover,
  createVerticalBarShape,
  getCommonTooltipProps,
} from '../common/chart-effects';

export interface TorByDepartmentChartProps {
  data: DepartmentTorData[];
}

export const TorByDepartmentChart: React.FC<TorByDepartmentChartProps> = ({ data }) => {
  const { activeIndex, onMouseMove, onMouseLeave } = useChartHover();

  return (
    <div className="bg-[#111827] border border-[#1f293d] rounded-xl p-4 shadow-xl flex flex-col justify-between h-full">
      <h3 className="text-xs font-bold uppercase text-white mb-3 flex items-center gap-1.5">
        <span className="w-1.5 h-3 bg-rose-500 rounded-sm"></span>
        TOR Theo Khối Đơn Vị (%)
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
            <YAxis
              stroke="#64748b"
              tick={{ fontSize: 9, fill: '#94a3b8' }}
              tickFormatter={(v) => `${v}%`}
              domain={[0, 25]}
            />
            <Tooltip
              {...getCommonTooltipProps()}
              formatter={(value: number) => [`${value}%`, 'TOR YTD']}
            />
            <Bar
              dataKey="tor"
              name="TOR YTD"
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
