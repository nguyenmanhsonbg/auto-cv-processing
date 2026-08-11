import type { ReactNode } from 'react';

export type StatsMetricItem = {
  label: string;
  value: ReactNode;
  accent?: boolean;
};

type StatsMetricGridProps = {
  items: StatsMetricItem[];
  ariaLabel?: string;
  className?: string;
};

export function StatsMetricGrid({ items, ariaLabel = 'Statistics', className }: StatsMetricGridProps) {
  return (
    <div className={`stats-metric-grid${className ? ` ${className}` : ''}`} aria-label={ariaLabel}>
      {items.map((item) => (
        <div className={`stats-metric-card${item.accent ? ' is-accent' : ''}`} key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </div>
      ))}
    </div>
  );
}
