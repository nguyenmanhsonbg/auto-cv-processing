import React, { useState } from 'react';
import { Sector } from 'recharts';

/**
 * Reusable hover hook for Recharts Bar and Pie charts
 */
export function useChartHover() {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const onMouseMove = (state: any) => {
    if (state && state.activeTooltipIndex !== undefined) {
      setActiveIndex(Number(state.activeTooltipIndex));
    }
  };

  const onMouseLeave = () => {
    setActiveIndex(null);
  };

  const onPieEnter = (_: any, index: number) => {
    setActiveIndex(index);
  };

  return {
    activeIndex,
    setActiveIndex,
    onMouseMove,
    onMouseLeave,
    onPieEnter,
  };
}

/**
 * Common dark-mode tooltip styling
 */
export function getCommonTooltipProps() {
  return {
    cursor: false,
    contentStyle: {
      backgroundColor: '#111827',
      borderColor: '#334155',
      color: '#f8fafc',
      fontSize: '11px',
      borderRadius: '8px',
      boxShadow: '0 10px 15px -3px rgba(0,0,0,0.5)',
    },
    itemStyle: { color: '#93c5fd' },
    labelStyle: { color: '#ffffff', fontWeight: 'bold' as const, marginBottom: '2px' },
  };
}

export interface ChartTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string | number;
  title?: string;
  labelFormatter?: (label: any) => string;
  valueFormatter?: (value: any, name?: string, item?: any) => string;
  total?: number;
  unit?: string;
  hideLabel?: boolean;
}

/**
 * Reusable dark-mode tooltip that displays the colored legend box next to each item
 */
export const ChartTooltip: React.FC<ChartTooltipProps> = ({
  active,
  payload,
  label,
  title,
  labelFormatter,
  valueFormatter,
  total,
  unit = '',
  hideLabel = false,
}) => {
  if (!active || !payload || !payload.length) return null;

  const headerTitle =
    title !== undefined
      ? title
      : hideLabel
      ? null
      : labelFormatter
      ? labelFormatter(label)
      : label;

  return (
    <div className="bg-[#111827] border border-[#334155] rounded-lg p-2.5 shadow-2xl text-[11px] min-w-[130px] z-50">
      {headerTitle ? (
        <div className="text-white font-bold mb-1.5 pb-1 border-b border-[#334155]">
          {headerTitle}
        </div>
      ) : null}
      <div className="space-y-1.5">
        {payload.map((entry: any, index: number) => {
          const color =
            entry.color ||
            entry.payload?.color ||
            entry.fill ||
            entry.stroke ||
            '#38bdf8';
          const name = entry.name || entry.dataKey || '';
          let displayVal = entry.value;

          if (valueFormatter) {
            displayVal = valueFormatter(entry.value, name, entry);
          } else if (total && typeof entry.value === 'number') {
            const percent = total > 0 ? ((entry.value / total) * 100).toFixed(1) : '0';
            displayVal = `${entry.value}${unit ? ` ${unit}` : ''} (${percent}%)`;
          } else if (unit && entry.value !== undefined && entry.value !== null) {
            displayVal = `${entry.value} ${unit}`;
          }

          return (
            <div key={`tooltip-item-${index}`} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="text-slate-300">{name}</span>
              </span>
              <span className="text-white font-medium pl-2">{displayVal}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/**
 * Animated Vertical Bar Shape (scales up ~5-8% on hover with smooth transition)
 */
export const createVerticalBarShape = (
  activeIndex: number | null,
  radius = 4,
  scaleWidthPercent = 0.08,
  scaleHeightPercent = 0.05
) => {
  return (props: any): React.ReactElement => {
    const { fill, x = 0, y = 0, width = 0, height = 0, index } = props;
    if (width <= 0 || height <= 0) return <path d="" />;

    const isHovered = activeIndex !== null && index === activeIndex;
    const scaleW = isHovered ? width * scaleWidthPercent : 0;
    const scaleH = isHovered ? height * scaleHeightPercent : 0;
    const curX = x - scaleW / 2;
    const curY = y - scaleH;
    const curW = width + scaleW;
    const curH = height + scaleH;
    const r = Math.min(radius, curW / 2, curH);

    return (
      <path
        d={`
          M${curX},${curY + r}
          Q${curX},${curY} ${curX + r},${curY}
          L${curX + curW - r},${curY}
          Q${curX + curW},${curY} ${curX + curW},${curY + r}
          L${curX + curW},${curY + curH}
          L${curX},${curY + curH}
          Z
        `}
        fill={fill}
        style={{
          transition: 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)',
          filter: isHovered
            ? 'brightness(1.15) drop-shadow(0 4px 10px rgba(0,0,0,0.5))'
            : 'brightness(1)',
          cursor: 'pointer',
        }}
      />
    );
  };
};

/**
 * Animated Horizontal Bar Shape (scales up ~5% horizontally and ~10% vertically on hover)
 */
export const createHorizontalBarShape = (
  activeIndex: number | null,
  radius = 3,
  scaleWidthPercent = 0.05,
  scaleHeightPercent = 0.12
) => {
  return (props: any): React.ReactElement => {
    const { fill, x = 0, y = 0, width = 0, height = 0, index } = props;
    if (width <= 0 || height <= 0) return <path d="" />;

    const isHovered = activeIndex !== null && index === activeIndex;
    const scaleW = isHovered ? width * scaleWidthPercent : 0;
    const scaleH = isHovered ? height * scaleHeightPercent : 0;
    const curX = x;
    const curY = y - scaleH / 2;
    const curW = width + scaleW;
    const curH = height + scaleH;
    const r = Math.min(radius, curH / 2);

    return (
      <path
        d={`
          M${curX},${curY}
          L${curX + curW - r},${curY}
          Q${curX + curW},${curY} ${curX + curW},${curY + r}
          L${curX + curW},${curY + curH - r}
          Q${curX + curW},${curY + curH} ${curX + curW - r},${curY + curH}
          L${curX},${curY + curH}
          Z
        `}
        fill={fill}
        style={{
          transition: 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)',
          filter: isHovered
            ? 'brightness(1.18) drop-shadow(0 3px 8px rgba(0,0,0,0.5))'
            : 'brightness(1)',
          cursor: 'pointer',
        }}
      />
    );
  };
};

/**
 * Reusable Active Donut Shape for Pie/Donut Charts (smoothly expands slice outwards with subtle glow)
 */
export const renderActiveDonutShape = (props: any) => {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;

  return (
    <g
      style={{
        transformOrigin: `${cx}px ${cy}px`,
        animation: 'donutSliceZoom 320ms cubic-bezier(0.22, 1, 0.36, 1) forwards',
        cursor: 'pointer',
      }}
    >
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
    </g>
  );
};
