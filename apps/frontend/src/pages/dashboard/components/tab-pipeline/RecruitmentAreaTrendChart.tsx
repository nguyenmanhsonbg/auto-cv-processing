import React from 'react';
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { MonthlyTrend } from '../../types';

export interface RecruitmentAreaTrendChartProps {
  data?: MonthlyTrend[];
  subtitle?: string;
}

export const RecruitmentAreaTrendChart: React.FC<RecruitmentAreaTrendChartProps> = ({
  data = [],
  subtitle = 'So sánh Chỉ tiêu (Target), Ứng viên mới, Phỏng vấn và Đã tuyển theo tháng',
}) => {
  const chartData = data;

  const totalTarget = chartData.reduce((sum, item) => sum + (item.target || 0), 0);
  const totalApps = chartData.reduce((sum, item) => sum + item.newApplications, 0);
  const totalItv = chartData.reduce((sum, item) => sum + (item.interviewed || 0), 0);
  const totalHired = chartData.reduce((sum, item) => sum + item.hired, 0);
  // const targetAchievement = totalTarget > 0 ? ((totalHired / totalTarget) * 100).toFixed(1) : '0';

  return (
    <div className="bg-[#111827] border border-[#1f293d] rounded-xl p-5 shadow-xl flex flex-col justify-between h-full">
      {/* Header with Title and Summary Stats */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-3">
        <div>
          <h3 className="text-xs font-bold uppercase text-white flex items-center gap-1.5">
            <span className="w-2 h-3.5 bg-rose-500 rounded-sm"></span>
            BIỂU ĐỒ MIỀN XU HƯỚNG TUYỂN DỤNG THEO THÁNG
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>
        </div>

        {/* Quick summary badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="bg-rose-950/40 border border-rose-800/40 rounded-lg px-2.5 py-1 text-center">
            <div className="text-[10px] text-rose-300 font-medium">Chỉ tiêu (Target)</div>
            <div className="text-xs font-bold text-rose-400">{totalTarget || '—'}</div>
          </div>
          <div className="bg-blue-950/40 border border-blue-800/40 rounded-lg px-2.5 py-1 text-center">
            <div className="text-[10px] text-blue-300 font-medium">Tổng ứng viên</div>
            <div className="text-xs font-bold text-blue-400">{totalApps}</div>
          </div>
          <div className="bg-purple-950/40 border border-purple-800/40 rounded-lg px-2.5 py-1 text-center">
            <div className="text-[10px] text-purple-300 font-medium">Tham gia PV</div>
            <div className="text-xs font-bold text-purple-400">{totalItv}</div>
          </div>
          <div className="bg-emerald-950/40 border border-emerald-800/40 rounded-lg px-2.5 py-1 text-center">
            <div className="text-[10px] text-emerald-300 font-medium">Đã tuyển</div>
            <div className="text-xs font-bold text-emerald-400">{totalHired}</div>
          </div>
          {/* <div className="bg-cyan-950/40 border border-cyan-800/40 rounded-lg px-2.5 py-1 text-center">
            <div className="text-[10px] text-cyan-300 font-medium">Đạt chỉ tiêu</div>
            <div className="text-xs font-bold text-cyan-400">{targetAchievement}%</div>
          </div> */}
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="h-64 w-full mt-2">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid stroke="#1f293d" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="month"
              stroke="#64748b"
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              tickFormatter={(value: string) => {
                if (!value) return '';
                if (value.startsWith('T') || value.startsWith('Tháng')) return value;
                const parts = value.split('-');
                if (parts.length >= 2) {
                  return `T${parseInt(parts[1], 10)}/${parts[0].slice(2)}`;
                }
                return value;
              }}
            />
            <YAxis stroke="#64748b" tick={{ fontSize: 10, fill: '#94a3b8' }} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#111827',
                borderColor: '#334155',
                color: '#f8fafc',
                fontSize: '11px',
                borderRadius: '8px',
                boxShadow: '0 10px 15px -3px rgba(0,0,0,0.5)',
              }}
              labelFormatter={(label) => {
                if (!label) return '';
                if (String(label).includes('-')) {
                  const parts = String(label).split('-');
                  if (parts.length >= 2) {
                    return `Tháng ${parseInt(parts[1], 10)}/${parts[0]}`;
                  }
                }
                return `Tháng ${label}`;
              }}
            />
            <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} iconSize={10} />

            {/* New Applications Area (Ứng viên mới - Miền màu xanh dương) */}
            <Area
              type="monotone"
              dataKey="newApplications"
              name="Ứng viên mới"
              stroke="#3b82f6"
              fill="#3b82f6"
              fillOpacity={0.25}
              strokeWidth={1.5}
              dot={{ fill: 'rgba(96, 165, 250, 0.5)', r: 3.5, stroke: '#60a5fa', strokeWidth: 1.5 }}
              activeDot={{ fill: '#60a5fa', r: 5, stroke: '#60a5fa', strokeWidth: 2 }}
            />

            {/* Interviewed Area (Tham gia phỏng vấn - Miền màu tím) */}
            <Area
              type="monotone"
              dataKey="interviewed"
              name="Tham gia phỏng vấn"
              stroke="#a855f7"
              fill="#a855f7"
              fillOpacity={0.3}
              strokeWidth={1.5}
              dot={{ fill: 'rgba(192, 132, 252, 0.5)', r: 3.5, stroke: '#c084fc', strokeWidth: 1.5 }}
              activeDot={{ fill: '#c084fc', r: 5, stroke: '#c084fc', strokeWidth: 2 }}
            />

            {/* Hired Area (Đã tuyển - Miền màu xanh lá) */}
            <Area
              type="monotone"
              dataKey="hired"
              name="Đã tuyển"
              stroke="#10b981"
              fill="#10b981"
              fillOpacity={0.45}
              strokeWidth={1.5}
              dot={{ fill: 'rgba(52, 211, 153, 0.5)', r: 3.5, stroke: '#34d399', strokeWidth: 1.5 }}
              activeDot={{ fill: '#34d399', r: 5, stroke: '#34d399', strokeWidth: 2 }}
            />

            {/* Target Line (Chỉ tiêu - Đường Line nét đứt màu đỏ, không đổ màu miền) */}
            <Line
              type="monotone"
              dataKey="target"
              name="Chỉ tiêu (Target)"
              stroke="#f43f5e"
              strokeDasharray="4 4"
              strokeWidth={1.5}
              dot={{ fill: 'rgba(251, 113, 133, 0.5)', r: 3.5, stroke: '#fb7185', strokeWidth: 1.5 }}
              activeDot={{ fill: '#fb7185', r: 5, stroke: '#fb7185', strokeWidth: 2 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
