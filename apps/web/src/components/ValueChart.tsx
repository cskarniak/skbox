'use client';

import { useId } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Brush,
} from 'recharts';
import { formatTime, getValueMeta } from '@/lib/history';

export type ChartType = 'line' | 'bar' | 'area';

export function ValueChart({
  series,
  chartType,
  color,
  valueKey,
  height = 280,
}: {
  series: { time: number; value: number }[];
  chartType: ChartType;
  color: string;
  valueKey: string;
  height?: number;
}) {
  const gradientId = `value-chart-gradient-${useId().replace(/[:]/g, '')}`;
  const { unit } = getValueMeta(valueKey);
  const formatValue = (v: number) => `${v}${unit ? ` ${unit}` : ''}`;

  return (
    <ResponsiveContainer width="100%" height={height}>
      {chartType === 'bar' ? (
        <BarChart data={series}>
          <CartesianGrid strokeDasharray="0" stroke="var(--mantine-color-dark-4)" vertical={false} />
          <XAxis dataKey="time" type="number" domain={['dataMin', 'dataMax']} tickFormatter={formatTime} tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} width={48} tickFormatter={formatValue} />
          <RechartsTooltip labelFormatter={(v) => formatTime(v as number)} formatter={(v) => [formatValue(v as number), '']} />
          <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} maxBarSize={24} />
          <Brush dataKey="time" height={24} tickFormatter={formatTime} travellerWidth={8} />
        </BarChart>
      ) : chartType === 'area' ? (
        <AreaChart data={series}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.4} />
              <stop offset="95%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="0" stroke="var(--mantine-color-dark-4)" vertical={false} />
          <XAxis dataKey="time" type="number" domain={['dataMin', 'dataMax']} tickFormatter={formatTime} tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} width={48} tickFormatter={formatValue} domain={['auto', 'auto']} />
          <RechartsTooltip labelFormatter={(v) => formatTime(v as number)} formatter={(v) => [formatValue(v as number), '']} />
          <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#${gradientId})`} />
          <Brush dataKey="time" height={24} tickFormatter={formatTime} travellerWidth={8} />
        </AreaChart>
      ) : (
        <LineChart data={series}>
          <CartesianGrid strokeDasharray="0" stroke="var(--mantine-color-dark-4)" vertical={false} />
          <XAxis dataKey="time" type="number" domain={['dataMin', 'dataMax']} tickFormatter={formatTime} tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} width={48} tickFormatter={formatValue} domain={['auto', 'auto']} />
          <RechartsTooltip labelFormatter={(v) => formatTime(v as number)} formatter={(v) => [formatValue(v as number), '']} />
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} />
          <Brush dataKey="time" height={24} tickFormatter={formatTime} travellerWidth={8} />
        </LineChart>
      )}
    </ResponsiveContainer>
  );
}
