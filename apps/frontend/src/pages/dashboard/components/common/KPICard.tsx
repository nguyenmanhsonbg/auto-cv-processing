import React from 'react';

export interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: React.ReactNode;
  borderVariant?: 'emerald' | 'rose' | 'blue' | 'amber' | 'purple';
  valueColor?: string;
  className?: string;
}

const BORDER_VARIANTS = {
  emerald: 'border-l-4 border-l-emerald-500',
  rose: 'border-l-4 border-l-rose-500',
  blue: 'border-l-4 border-l-blue-500',
  amber: 'border-l-4 border-l-amber-500',
  purple: 'border-l-4 border-l-purple-500',
};

const DEFAULT_VALUE_COLORS = {
  emerald: 'text-emerald-400',
  rose: 'text-rose-400',
  blue: 'text-blue-400',
  amber: 'text-amber-400',
  purple: 'text-purple-400',
};

export const KPICard: React.FC<KPICardProps> = ({
  title,
  value,
  subtitle,
  borderVariant = 'blue',
  valueColor,
  className = '',
}) => {
  const chosenColor = valueColor || DEFAULT_VALUE_COLORS[borderVariant] || 'text-white';

  return (
    <div
      className={`bg-[#111827] border border-[#1f293d] p-4 rounded-xl shadow-lg transition hover:border-slate-700 ${BORDER_VARIANTS[borderVariant]} ${className}`}
    >
      <span className="text-xs text-slate-400 uppercase font-medium tracking-wider block">
        {title}
      </span>
      <p className={`text-2xl md:text-3xl font-bold mt-1 tracking-tight ${chosenColor}`}>
        {value}
      </p>
      {subtitle && (
        <div className="text-[11px] text-slate-400 mt-1">
          {subtitle}
        </div>
      )}
    </div>
  );
};
