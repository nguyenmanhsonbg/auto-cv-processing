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
import { PositionStat } from '../../types';
import {
  useChartHover,
  createVerticalBarShape,
  getCommonTooltipProps,
} from '../common/chart-effects';

export interface PositionProgressChartProps {
  data: PositionStat[];
}

export const PositionProgressChart: React.FC<PositionProgressChartProps> = ({ data }) => {
  const { activeIndex, onMouseMove, onMouseLeave } = useChartHover();

  return (
    <div className="bg-[#111827] border border-[#1f293d] rounded-xl p-4 shadow-xl flex flex-col justify-between h-full">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-xs font-bold uppercase text-white flex items-center gap-1.5">
          <span className="w-1.5 h-3 bg-blue-500 rounded-sm"></span>
          TIẾN ĐỘ TUYỂN DỤNG THEO VỊ TRÍ
        </h3>
        <span className="text-[10px] text-slate-400 font-mono">{data.some((item) => item.target !== null) ? 'Target vs Hired' : 'Hired thực tế'}</span>
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
            <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 9, fill: '#94a3b8' }} />
            <YAxis
              stroke="#64748b"
              tick={{ fontSize: 9, fill: '#94a3b8' }}
              domain={[0, 30]}
              ticks={[0, 5, 10, 15, 20, 25, 30]}
              label={{
                value: 'Số lượng',
                angle: -90,
                position: 'insideLeft',
                offset: 25,
                style: { textAnchor: 'middle', fontSize: 10, fill: '#64748b' },
              }}
            />
            <Tooltip {...getCommonTooltipProps()} />
            {data.some((item) => item.target !== null) && <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '4px' }} iconSize={8} />}
            {data.some((item) => item.target !== null) && <Bar
              dataKey="target"
              name="Chỉ tiêu (Target)"
              fill="#475569"
              radius={[3, 3, 0, 0]}
              shape={createVerticalBarShape(activeIndex, 3)}
            />}
            <Bar
              dataKey="hired"
              name="Đã Hired"
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
