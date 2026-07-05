'use client';

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
import { formatTime } from '@/lib/history';

export type ChartType = 'line' | 'bar' | 'area';

export function ValueChart({
  series,
  chartType,
  color,
  height = 260,
}: {
  series: { time: number; value: number }[];
  chartType: ChartType;
  color: string;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      {chartType === 'bar' ? (
        <BarChart data={series}>
          <CartesianGrid strokeDasharray="0" stroke="var(--mantine-color-dark-4)" vertical={false} />
          <XAxis dataKey="time" type="number" domain={['dataMin', 'dataMax']} tickFormatter={formatTime} tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} width={40} />
          <RechartsTooltip labelFormatter={(v) => formatTime(v as number)} />
          <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} maxBarSize={24} />
          <Brush dataKey="time" height={20} tickFormatter={formatTime} travellerWidth={8} />
        </BarChart>
      ) : chartType === 'area' ? (
        <AreaChart data={series}>
          <CartesianGrid strokeDasharray="0" stroke="var(--mantine-color-dark-4)" vertical={false} />
          <XAxis dataKey="time" type="number" domain={['dataMin', 'dataMax']} tickFormatter={formatTime} tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} width={40} />
          <RechartsTooltip labelFormatter={(v) => formatTime(v as number)} />
          <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={color} fillOpacity={0.1} />
          <Brush dataKey="time" height={20} tickFormatter={formatTime} travellerWidth={8} />
        </AreaChart>
      ) : (
        <LineChart data={series}>
          <CartesianGrid strokeDasharray="0" stroke="var(--mantine-color-dark-4)" vertical={false} />
          <XAxis dataKey="time" type="number" domain={['dataMin', 'dataMax']} tickFormatter={formatTime} tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} width={40} />
          <RechartsTooltip labelFormatter={(v) => formatTime(v as number)} />
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} />
          <Brush dataKey="time" height={20} tickFormatter={formatTime} travellerWidth={8} />
        </LineChart>
      )}
    </ResponsiveContainer>
  );
}
