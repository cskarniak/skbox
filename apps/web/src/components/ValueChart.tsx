'use client';

import { useId, useMemo } from 'react';
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
import { formatTime, formatDate, getValueMeta, buildTimeTicks, buildStepTicks } from '@/lib/history';

export type ChartType = 'line' | 'bar' | 'area';

const X_TICK_STEP_MS = 2 * 24 * 3600_000; // graduation tous les 2 jours
const Y_STEP_BY_KEY: Record<string, number> = {
  temperature: 5,
};

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

  const xTicks = useMemo(() => {
    if (series.length === 0) return [];
    return buildTimeTicks(series[0].time, series[series.length - 1].time, X_TICK_STEP_MS);
  }, [series]);

  const yStep = Y_STEP_BY_KEY[valueKey];
  const yTicksInfo = useMemo(() => {
    if (!yStep || series.length === 0) return null;
    const values = series.map((p) => p.value);
    return buildStepTicks(Math.min(...values), Math.max(...values), yStep);
  }, [series, yStep]);

  const yAxisProps = yTicksInfo
    ? { ticks: yTicksInfo.ticks, domain: yTicksInfo.domain }
    : { domain: ['auto', 'auto'] as [string, string] };

  return (
    <ResponsiveContainer width="100%" height={height}>
      {chartType === 'bar' ? (
        <BarChart data={series}>
          <CartesianGrid strokeDasharray="0" stroke="var(--mantine-color-dark-4)" />
          <XAxis dataKey="time" type="number" domain={['dataMin', 'dataMax']} ticks={xTicks} tickFormatter={formatDate} tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} width={48} tickFormatter={formatValue} {...yAxisProps} />
          <RechartsTooltip labelFormatter={(v) => formatTime(v as number)} formatter={(v) => [formatValue(v as number), '']} />
          <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} maxBarSize={24} />
          <Brush dataKey="time" height={24} tickFormatter={formatDate} travellerWidth={8} />
        </BarChart>
      ) : chartType === 'area' ? (
        <AreaChart data={series}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.4} />
              <stop offset="95%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="0" stroke="var(--mantine-color-dark-4)" />
          <XAxis dataKey="time" type="number" domain={['dataMin', 'dataMax']} ticks={xTicks} tickFormatter={formatDate} tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} width={48} tickFormatter={formatValue} {...yAxisProps} />
          <RechartsTooltip labelFormatter={(v) => formatTime(v as number)} formatter={(v) => [formatValue(v as number), '']} />
          <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#${gradientId})`} />
          <Brush dataKey="time" height={24} tickFormatter={formatDate} travellerWidth={8} />
        </AreaChart>
      ) : (
        <LineChart data={series}>
          <CartesianGrid strokeDasharray="0" stroke="var(--mantine-color-dark-4)" />
          <XAxis dataKey="time" type="number" domain={['dataMin', 'dataMax']} ticks={xTicks} tickFormatter={formatDate} tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} width={48} tickFormatter={formatValue} {...yAxisProps} />
          <RechartsTooltip labelFormatter={(v) => formatTime(v as number)} formatter={(v) => [formatValue(v as number), '']} />
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} />
          <Brush dataKey="time" height={24} tickFormatter={formatDate} travellerWidth={8} />
        </LineChart>
      )}
    </ResponsiveContainer>
  );
}
