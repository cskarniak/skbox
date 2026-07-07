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
  Legend,
  Brush,
} from 'recharts';
import { formatTime, formatDate, getValueMeta, buildTimeTicks, buildValueTicks } from '@/lib/history';

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

  const xTicks = useMemo(() => {
    if (series.length === 0) return [];
    return buildTimeTicks(series[0].time, series[series.length - 1].time);
  }, [series]);

  const yAxisProps = useMemo(() => {
    if (series.length === 0) return { domain: ['auto', 'auto'] as [string, string] };
    const values = series.map((p) => p.value);
    const { ticks, domain } = buildValueTicks(Math.min(...values), Math.max(...values));
    return { ticks, domain };
  }, [series]);

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

export interface OverlaySeries {
  id: string;
  label: string;
  color: string;
  valueKey: string;
  data: { time: number; value: number }[];
}

// Superpose plusieurs courbes sur un même graphique (toujours en lignes : mélanger
// barres/aires empilées entre séries indépendantes serait illisible). Au plus deux
// unités différentes sont supportées (axe gauche pour la première rencontrée, axe
// droit pour la suivante) — au-delà, les séries supplémentaires partagent l'axe droit,
// ce qui reste un compromis raisonnable pour un cas d'usage marginal.
export function OverlayChart({ series, height = 280 }: { series: OverlaySeries[]; height?: number }) {
  const allTimes = series.flatMap((s) => s.data.map((p) => p.time));
  const xTicks = useMemo(() => {
    if (allTimes.length === 0) return [];
    return buildTimeTicks(Math.min(...allTimes), Math.max(...allTimes));
  }, [allTimes]);

  const units = useMemo(() => series.map((s) => getValueMeta(s.valueKey).unit), [series]);
  const primaryUnit = units[0];
  const secondaryUnit = units.find((u) => u !== primaryUnit);
  const yAxisIdFor = (unit: string) => (secondaryUnit && unit !== primaryUnit ? 'right' : 'left');
  const formatAxisValue = (unit: string) => (v: number) => `${v}${unit ? ` ${unit}` : ''}`;

  // Sans domaine explicite, Recharts force l'axe Y à démarrer à 0 par défaut — ce qui
  // écrase une bonne partie du graphique si les valeurs réelles restent loin de 0 (ex.
  // des températures qui oscillent entre 15 et 30°C). On recalcule donc le domaine à
  // partir des valeurs effectivement affichées sur chaque axe, comme pour ValueChart.
  const leftAxis = useMemo(() => {
    const values = series
      .filter((s) => yAxisIdFor(getValueMeta(s.valueKey).unit) === 'left')
      .flatMap((s) => s.data.map((p) => p.value));
    if (values.length === 0) return { ticks: undefined, domain: ['auto', 'auto'] as [string, string] };
    return buildValueTicks(Math.min(...values), Math.max(...values));
  }, [series, secondaryUnit]);

  const rightAxis = useMemo(() => {
    const values = series
      .filter((s) => yAxisIdFor(getValueMeta(s.valueKey).unit) === 'right')
      .flatMap((s) => s.data.map((p) => p.value));
    if (values.length === 0) return { ticks: undefined, domain: ['auto', 'auto'] as [string, string] };
    return buildValueTicks(Math.min(...values), Math.max(...values));
  }, [series, secondaryUnit]);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart>
        <CartesianGrid strokeDasharray="0" stroke="var(--mantine-color-dark-4)" />
        <XAxis
          dataKey="time"
          type="number"
          domain={['dataMin', 'dataMax']}
          ticks={xTicks}
          tickFormatter={formatDate}
          tick={{ fontSize: 11 }}
          allowDuplicatedCategory={false}
        />
        <YAxis
          yAxisId="left"
          tick={{ fontSize: 11 }}
          width={48}
          tickFormatter={formatAxisValue(primaryUnit ?? '')}
          ticks={leftAxis.ticks}
          domain={leftAxis.domain}
        />
        {secondaryUnit && (
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 11 }}
            width={48}
            tickFormatter={formatAxisValue(secondaryUnit)}
            ticks={rightAxis.ticks}
            domain={rightAxis.domain}
          />
        )}
        <RechartsTooltip
          labelFormatter={(v) => formatTime(v as number)}
          formatter={(v, name) => [v as number, name]}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {series.map((s) => (
          <Line
            key={s.id}
            data={s.data}
            dataKey="value"
            name={s.label}
            stroke={s.color}
            strokeWidth={2}
            dot={false}
            type="monotone"
            yAxisId={yAxisIdFor(getValueMeta(s.valueKey).unit)}
          />
        ))}
        <Brush dataKey="time" height={24} tickFormatter={formatDate} travellerWidth={8} />
      </LineChart>
    </ResponsiveContainer>
  );
}
