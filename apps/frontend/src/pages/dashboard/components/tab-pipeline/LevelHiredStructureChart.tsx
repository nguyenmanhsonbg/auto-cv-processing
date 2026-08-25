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
import { LevelHiredData, LEVEL_LABELS } from '../../types';
import {
  useChartHover,
  createHorizontalBarShape,
  ChartTooltip,
} from '../common/chart-effects';

export interface LevelHiredStructureChartProps {
  data: LevelHiredData[];
  totalHired?: number;
}

export const LevelHiredStructureChart: React.FC<LevelHiredStructureChartProps> = ({
  data,
  totalHired = 96,
}) => {
  const { activeIndex, onMouseMove, onMouseLeave } = useChartHover();
  const calculatedTotal = totalHired ?? data.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="bg-[#111827] border border-[#1f293d] rounded-xl p-4 shadow-xl flex flex-col justify-between h-full">
      <div className="flex justify-between items-center mb-1">
        <h3 className="text-xs font-bold uppercase text-white flex items-center gap-1.5">
          <span className="w-1.5 h-3 bg-amber-500 rounded-sm"></span>
          3. CƠ CẤU LEVEL HIRED (SC-09)
        </h3>
        <span className="text-[10px] font-bold text-emerald-400 font-mono">
          {calculatedTotal} Hired
        </span>
      </div>

      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            layout="vertical"
            data={data}
            margin={{ top: 5, right: 15, left: 10, bottom: 15 }}
            onMouseMove={onMouseMove}
            onMouseLeave={onMouseLeave}
          >
            <CartesianGrid stroke="#1f293d" strokeDasharray="3 3" horizontal={false} />
            <XAxis
              type="number"
              domain={[0, 50]}
              ticks={[0, 10, 20, 30, 40, 50]}
              stroke="#64748b"
              tick={{ fontSize: 9, fill: '#94a3b8' }}
              label={{
                value: 'Số lượng nhân sự (người)',
                position: 'insideBottom',
                offset: -10,
                style: { textAnchor: 'middle', fontSize: 8.5, fill: '#64748b' },
              }}
            />
            <YAxis
              type="category"
              dataKey="level"
              stroke="#64748b"
              tick={{ fontSize: 9, fill: '#94a3b8' }}
              tickFormatter={(v) => LEVEL_LABELS[v] || v}
              width={75}
            />
            <Tooltip
              cursor={false}
              content={
                <ChartTooltip
                  labelFormatter={(v) => LEVEL_LABELS[v] || v}
                  valueFormatter={(value) => `${value} người`}
                />
              }
            />
            <Bar
              dataKey="count"
              name="Đã tuyển"
              radius={[0, 3, 3, 0]}
              shape={createHorizontalBarShape(activeIndex, 3)}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Description Footer */}
      <div className="grid grid-cols-1 gap-0.5 pt-2 border-t border-slate-800/80 text-[8.5px] text-slate-400 font-mono">
        <div className="flex justify-between">
          <span className="text-slate-400">• Quản lý:</span>
          <span className="text-slate-500 truncate">Director, Manager, PM, Lead</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">• ≥ Senior:</span>
          <span className="text-slate-500 truncate">Senior, Specialist, Expert</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">• Experienced:</span>
          <span className="text-slate-500 truncate">Middle, Professional (1-3 năm)</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">• ≤ Junior:</span>
          <span className="text-slate-500 truncate">Junior, Entry Level, Fresher</span>
        </div>
      </div>
    </div>
  );
};
