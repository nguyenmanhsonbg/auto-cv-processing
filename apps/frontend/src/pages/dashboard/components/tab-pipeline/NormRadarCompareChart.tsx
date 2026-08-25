import React from 'react';
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { NormRadarData, NORM_METRIC_LABELS } from '../../types';

export interface NormRadarCompareChartProps {
  data: NormRadarData[];
}

export const NormRadarCompareChart: React.FC<NormRadarCompareChartProps> = ({ data }) => {
  return (
    <div className="bg-[#111827] border border-[#1f293d] rounded-xl p-4 shadow-xl flex flex-col justify-between h-full">
      <h3 className="text-xs font-bold uppercase text-white mb-1 flex items-center gap-1.5">
        <span className="w-1.5 h-3 bg-amber-500 rounded-sm"></span>
        5. ĐỐI SOÁT NORM CHUẨN 10/6/3/1
      </h3>
      <div className="h-64 w-full flex items-center justify-center">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart cx="50%" cy="50%" outerRadius="68%" data={data}>
            <PolarGrid stroke="#1f293d" />
            <PolarAngleAxis
              dataKey="metric"
              stroke="#94a3b8"
              tick={{ fontSize: 9, fill: '#94a3b8' }}
              tickFormatter={(v) => NORM_METRIC_LABELS[v] || v}
            />
            <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="#334155" tick={false} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#111827',
                borderColor: '#334155',
                color: '#f8fafc',
                fontSize: '11px',
                borderRadius: '8px',
                boxShadow: '0 10px 15px -3px rgba(0,0,0,0.5)',
              }}
              itemStyle={{ color: '#93c5fd' }}
              labelStyle={{ color: '#ffffff', fontWeight: 'bold', marginBottom: '2px' }}
              labelFormatter={(label) => NORM_METRIC_LABELS[label] || label}
              formatter={(value: number) => [`${value}%`]}
            />
            <Legend
              wrapperStyle={{ fontSize: '10px', paddingTop: '0px', marginBottom: '6px' }}
              iconSize={8}
              verticalAlign="top"
              align="center"
            />
            <Radar
              name="Norm Chuẩn"
              dataKey="norm"
              stroke="#64748b"
              fill="#64748b"
              fillOpacity={0.15}
              strokeDasharray="3 3"
            />
            <Radar
              name="Thực Tế"
              dataKey="actual"
              stroke="#f43f5e"
              fill="#f43f5e"
              fillOpacity={0.3}
              dot={{ fill: '#f43f5e', r: 3 }}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
