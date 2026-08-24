import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { QuotaForecastData } from '../../types';

export interface QuotaForecastChartProps {
  data: QuotaForecastData[];
}

export const QuotaForecastChart: React.FC<QuotaForecastChartProps> = ({ data }) => {
  return (
    <div className="bg-[#111827] border border-[#1f293d] rounded-xl p-4 shadow-lg flex flex-col justify-between">
      <h3 className="text-xs font-bold uppercase text-slate-300 mb-3 flex items-center gap-1.5">
        <span className="w-1.5 h-3 bg-amber-500 rounded-sm"></span>
        Dự Báo Tiến Độ Định Biên 2026
      </h3>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid stroke="#1f293d" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="period" stroke="#64748b" tick={{ fontSize: 9 }} />
            <YAxis
              stroke="#64748b"
              tick={{ fontSize: 10 }}
              domain={[600, 1100]}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#111827',
                borderColor: '#334155',
                color: '#f8fafc',
                fontSize: '11px',
                borderRadius: '8px',
              }}
              formatter={(value: number) => [`${value} nhân sự`]}
            />
            <Legend wrapperStyle={{ fontSize: '10px' }} iconSize={8} />
            <Line
              type="monotone"
              dataKey="standardPlan"
              name="Kịch bản Tuyển chuẩn"
              stroke="#10b981"
              strokeWidth={2}
              dot={{ r: 3, fill: '#10b981' }}
            />
            <Line
              type="monotone"
              dataKey="currentSlowPlan"
              name="Tốc độ Hiện tại (Chậm)"
              stroke="#e11d48"
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={{ r: 3, fill: '#e11d48' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
