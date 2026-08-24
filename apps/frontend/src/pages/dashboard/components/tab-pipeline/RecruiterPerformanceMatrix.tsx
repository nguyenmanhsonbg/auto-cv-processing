import React, { useState } from 'react';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { RecruiterBubbleData } from '../../types';

export interface RecruiterPerformanceMatrixProps {
  data: RecruiterBubbleData[];
}

export const RecruiterPerformanceMatrix: React.FC<RecruiterPerformanceMatrixProps> = ({ data }) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  return (
    <div className="bg-[#111827] border border-[#1f293d] rounded-xl p-4 shadow-xl flex flex-col justify-between h-full">
      <div className="mb-1">
        <h3 className="text-xs font-bold uppercase text-white flex items-center gap-1.5">
          <span className="w-1.5 h-3 bg-purple-500 rounded-sm"></span>
          MA TRẬN HIỆU SUẤT HRBP & TA (BUBBLE CHART)
        </h3>
        <p className="text-[10px] text-slate-400 mt-0.5 font-mono">
          X: TTH (ngày) | Y: Tỷ lệ Chốt Hired (%) | Bong bóng: Số lượng Hired
        </p>
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 15, right: 15, left: -15, bottom: 20 }}>
            <CartesianGrid stroke="#1f293d" strokeDasharray="3 3" />
            <XAxis
              type="number"
              dataKey="tth"
              name="TTH TB"
              domain={[10, 50]}
              ticks={[10, 15, 20, 25, 30, 35, 40, 45, 50]}
              stroke="#64748b"
              tick={{ fontSize: 9, fill: '#94a3b8' }}
              label={{
                value: 'TTH TB (Ngày LV)',
                position: 'insideBottom',
                offset: -12,
                style: { textAnchor: 'middle', fontSize: 9.5, fill: '#94a3b8' },
              }}
            />
            <YAxis
              type="number"
              dataKey="hiredRate"
              name="Tỷ lệ Chốt"
              domain={[0, 60]}
              ticks={[0, 10, 20, 30, 40, 50, 60]}
              stroke="#64748b"
              tick={{ fontSize: 9, fill: '#94a3b8' }}
              tickFormatter={(v) => `${v}%`}
              label={{
                value: 'Tỷ lệ Chốt Hired (%)',
                angle: -90,
                position: 'insideLeft',
                offset: 25,
                style: { textAnchor: 'middle', fontSize: 9, fill: '#64748b' },
              }}
            />
            <ZAxis type="number" dataKey="hiredCount" range={[200, 800]} name="Số lượng Hired" />
            <Tooltip
              cursor={{ strokeDasharray: '3 3' }}
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const d = payload[0].payload as RecruiterBubbleData;
                  return (
                    <div className="bg-[#111827] border border-slate-700 text-slate-200 text-xs p-2.5 rounded-lg shadow-xl space-y-1">
                      <p className="font-bold text-white flex items-center gap-1.5">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: d.color }}
                        ></span>
                        {d.name}
                      </p>
                      <p className="text-slate-300">
                        TTH: <b className="text-purple-400">{d.tth} ngày</b>
                      </p>
                      <p className="text-slate-300">
                        Tỷ lệ chốt: <b className="text-emerald-400">{d.hiredRate}%</b>
                      </p>
                      <p className="text-slate-300">
                        Đã Hired: <b className="text-blue-400">{d.hiredCount} người</b>
                      </p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Scatter
              name="HRBP & TA"
              data={data}
              onMouseEnter={(_, idx) => setHoveredIndex(idx)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              {data.map((entry, index) => {
                const isHovered = index === hoveredIndex;
                return (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.color}
                    stroke={isHovered ? '#ffffff' : entry.borderColor}
                    strokeWidth={isHovered ? 3 : 2}
                    fillOpacity={isHovered ? 1 : 0.85}
                    style={{
                      transition: 'all 200ms ease',
                      filter: isHovered
                        ? 'brightness(1.25) drop-shadow(0 4px 12px rgba(0,0,0,0.6))'
                        : 'brightness(1)',
                      cursor: 'pointer',
                    }}
                  />
                );
              })}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* Mini Legend */}
      <div className="flex flex-wrap items-center justify-center gap-3 pt-2 text-[9px] text-slate-400">
        {data.map((item) => (
          <span key={item.name} className="flex items-center gap-1">
            <span
              className="w-2 h-2 rounded-sm"
              style={{ backgroundColor: item.color }}
            ></span>
            {item.name}
          </span>
        ))}
      </div>
    </div>
  );
};
