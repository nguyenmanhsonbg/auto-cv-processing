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
  ReferenceLine,
} from 'recharts';
import { GrowthFlowData } from '../../types';
import { ChartTooltip } from '../common/chart-effects';

export interface MonthlyFlowChartProps {
  data: GrowthFlowData[];
}

export const MonthlyFlowChart: React.FC<MonthlyFlowChartProps> = ({ data }) => {
  return (
    <div className="bg-[#111827] border border-[#1f293d] rounded-xl p-4 shadow-lg flex flex-col justify-between">
      <h3 className="text-xs font-bold uppercase text-slate-300 mb-3 flex items-center gap-1.5">
        <span className="w-1.5 h-3 bg-emerald-500 rounded-sm"></span>
        Diễn Biến Tăng/Giảm Theo Tháng
      </h3>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid stroke="#1f293d" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="month" stroke="#64748b" tick={{ fontSize: 10 }} />
            <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
            <ReferenceLine y={0} stroke="#334155" />
            <Tooltip
              cursor={false}
              content={
                <ChartTooltip
                  valueFormatter={(value) => `${Number(value) > 0 ? '+' : ''}${value} người`}
                />
              }
            />
            <Legend
              wrapperStyle={{ fontSize: '10px', paddingTop: '8px' }}
              iconSize={8}
            />
            <Bar dataKey="tangMoi" name="Tăng mới (+)" fill="#10b981" radius={[3, 3, 0, 0]} />
            <Bar dataKey="nghiViec" name="Nghỉ việc (-)" fill="#e11d48" radius={[0, 0, 3, 3]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
