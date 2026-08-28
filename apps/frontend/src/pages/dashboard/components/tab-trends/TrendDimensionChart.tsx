import React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TrendDimension } from '@/lib/dashboard-api';

interface TrendDimensionChartProps {
  title: string;
  subtitle: string;
  data: TrendDimension[];
}

const LABELS: Record<string, string> = {
  totalFinalItv: 'Final ITV',
  totalOffer: 'Vòng Offer',
  hired: 'Hired',
};

export const TrendDimensionChart: React.FC<Readonly<TrendDimensionChartProps>> = ({ title, subtitle, data }) => (
  <section className="rounded-xl border border-[#1f293d] bg-[#111827] p-4 shadow-xl">
    <div className="mb-3">
      <h2 className="text-xs font-bold uppercase tracking-wide text-white">{title}</h2>
      <p className="mt-1 text-[11px] text-slate-400">{subtitle}</p>
    </div>
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 12, left: -18, bottom: 55 }}>
          <CartesianGrid stroke="#1f293d" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            stroke="#64748b"
            interval={0}
            angle={-25}
            textAnchor="end"
            height={70}
            tick={{ fontSize: 9, fill: '#94a3b8' }}
          />
          <YAxis stroke="#64748b" tick={{ fontSize: 9, fill: '#94a3b8' }} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: '#1e293b', opacity: 0.35 }}
            contentStyle={{ backgroundColor: '#111827', borderColor: '#334155', color: '#f8fafc', fontSize: '11px', borderRadius: '8px' }}
            formatter={(value: number, name: string) => [value, LABELS[name] || name]}
          />
          <Legend wrapperStyle={{ fontSize: '11px' }} formatter={(value) => LABELS[value] || value} />
          <Bar dataKey="totalFinalItv" name="totalFinalItv" fill="#f59e0b" radius={[3, 3, 0, 0]} />
          <Bar dataKey="totalOffer" name="totalOffer" fill="#f97316" radius={[3, 3, 0, 0]} />
          <Bar dataKey="hired" name="hired" fill="#10b981" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  </section>
);
