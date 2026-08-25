import React from 'react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { GrowthSourceData } from '../../types';
import {
  useChartHover,
  renderActiveDonutShape,
  getCommonTooltipProps,
} from '../common/chart-effects';

export interface SourceStructureChartProps {
  data: GrowthSourceData[];
}

export const SourceStructureChart: React.FC<SourceStructureChartProps> = ({ data }) => {
  const { activeIndex, onPieEnter, onMouseLeave } = useChartHover();
  const total = data.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="bg-[#111827] border border-[#1f293d] rounded-xl p-4 shadow-xl flex flex-col justify-between h-full">
      <h3 className="text-xs font-bold uppercase text-white mb-3 flex items-center gap-1.5">
        <span className="w-1.5 h-3 bg-blue-500 rounded-sm"></span>
        Cơ Cấu Nguồn Tăng Mới
      </h3>
      <div className="h-56 w-full flex items-center justify-center">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={75}
              paddingAngle={3}
              activeIndex={activeIndex !== null ? activeIndex : undefined}
              activeShape={renderActiveDonutShape}
              onMouseEnter={onPieEnter}
              onMouseLeave={onMouseLeave}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} stroke="#0f172a" strokeWidth={2} />
              ))}
            </Pie>
            <Tooltip
              {...getCommonTooltipProps()}
              formatter={(value: number) => [
                `${value} người (${((value / total) * 100).toFixed(1)}%)`,
              ]}
            />
            <Legend
              wrapperStyle={{ fontSize: '10px' }}
              iconSize={8}
              layout="horizontal"
              verticalAlign="bottom"
              align="center"
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
