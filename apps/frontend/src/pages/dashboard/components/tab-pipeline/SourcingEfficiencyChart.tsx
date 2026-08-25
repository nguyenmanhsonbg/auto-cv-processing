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
import { SourcingStageData, SOURCING_STAGE_LABELS } from '../../types';

export interface SourcingEfficiencyChartProps {
  data: SourcingStageData[];
}

export const SourcingEfficiencyChart: React.FC<SourcingEfficiencyChartProps> = ({ data }) => {
  return (
    <div className="bg-[#111827] border border-[#1f293d] rounded-xl p-4 shadow-xl flex flex-col justify-between h-full">
      <h3 className="text-xs font-bold uppercase text-white mb-2 flex items-center gap-1.5">
        <span className="w-1.5 h-3 bg-blue-500 rounded-sm"></span>
        1. HIỆU QUẢ SOURCING & SÀNG LỌC
      </h3>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 25, right: 10, left: -15, bottom: 20 }}>
            <CartesianGrid stroke="#1f293d" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="stage"
              stroke="#64748b"
              tick={{ fontSize: 9, fill: '#94a3b8' }}
              tickFormatter={(v) => SOURCING_STAGE_LABELS[v] || v}
            />
            <YAxis
              stroke="#64748b"
              tick={{ fontSize: 9, fill: '#94a3b8' }}
              domain={[0, 200]}
              ticks={[0, 25, 50, 75, 100, 125, 150, 175, 200]}
              tickFormatter={(v) => v.toLocaleString()}
            />
            <Tooltip
              cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }}
              contentStyle={{
                backgroundColor: '#111827',
                borderColor: '#334155',
                color: '#f8fafc',
                fontSize: '11px',
                borderRadius: '8px',
                boxShadow: '0 10px 15px -3px rgba(0,0,0,0.5)',
              }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                return (
                  <div className="bg-[#111827] border border-[#334155] rounded-lg p-2.5 shadow-xl text-[11px]">
                    <div className="text-white font-bold mb-2 pb-1.5 border-b border-[#334155]">{label}</div>
                    <div className="space-y-1.5">
                      {[
                        { color: '#10b981', name: 'Đạt', value: payload.find(p => p.dataKey === 'pass')?.value },
                        { color: '#f43f5e', name: 'Không đạt', value: payload.find(p => p.dataKey === 'fail')?.value },
                      ].map(item => (
                        <div key={item.name} className="flex items-center justify-between gap-6">
                          <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: item.color }}></span>
                            <span className="text-slate-300">{item.name}</span>
                          </span>
                          <span className="text-white font-medium">{String(item.value ?? '—')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: '10.5px', paddingBottom: '12px' }}
              iconSize={8}
              verticalAlign="top"
              align="center"
            />
            <Bar dataKey="pass" name="Đạt" stackId="a" fill="#10b981" />
            <Bar dataKey="fail" name="Không đạt" stackId="a" fill="#f43f5e" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
