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

  // Un état binaire (interrupteur, présence...) affiché en courbe lissée ("monotone")
  // ou en barres ne montre que l'instant du changement — la valeur maintenue à 1
  // pendant sa durée disparaît visuellement. Un tracé "en escalier" (stepAfter) tient
  // la ligne à plat jusqu'au prochain point, ce qui représente correctement la durée.
  const isBinary = series.length > 0 && series.every((p) => p.value === 0 || p.value === 1);
  const effectiveChartType = isBinary ? 'line' : chartType;
  const lineType = isBinary ? 'stepAfter' : 'monotone';

  const xTicks = useMemo(() => {
    if (series.length === 0) return [];
    return buildTimeTicks(series[0].time, series[series.length - 1].time);
  }, [series]);

  const yAxisProps = useMemo(() => {
    if (isBinary) return { ticks: [0, 1], domain: [0, 1] as [number, number] };
    if (series.length === 0) return { domain: ['auto', 'auto'] as [string, string] };
    const values = series.map((p) => p.value);
    const { ticks, domain } = buildValueTicks(Math.min(...values), Math.max(...values));
    return { ticks, domain };
  }, [series, isBinary]);

  return (
    <ResponsiveContainer width="100%" height={height}>
      {effectiveChartType === 'bar' ? (
        <BarChart data={series}>
          <CartesianGrid strokeDasharray="0" stroke="var(--mantine-color-dark-4)" />
          <XAxis dataKey="time" type="number" domain={['dataMin', 'dataMax']} ticks={xTicks} tickFormatter={formatDate} tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} width={48} tickFormatter={formatValue} {...yAxisProps} />
          <RechartsTooltip labelFormatter={(v) => formatTime(v as number)} formatter={(v) => [formatValue(v as number), '']} />
          <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} maxBarSize={24} />
          <Brush dataKey="time" height={24} tickFormatter={formatDate} travellerWidth={8} />
        </BarChart>
      ) : effectiveChartType === 'area' ? (
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
          <Area type={lineType} dataKey="value" stroke={color} strokeWidth={2} fill={`url(#${gradientId})`} />
          <Brush dataKey="time" height={24} tickFormatter={formatDate} travellerWidth={8} />
        </AreaChart>
      ) : (
        <LineChart data={series}>
          <CartesianGrid strokeDasharray="0" stroke="var(--mantine-color-dark-4)" />
          <XAxis dataKey="time" type="number" domain={['dataMin', 'dataMax']} ticks={xTicks} tickFormatter={formatDate} tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} width={48} tickFormatter={formatValue} {...yAxisProps} />
          <RechartsTooltip labelFormatter={(v) => formatTime(v as number)} formatter={(v) => [formatValue(v as number), '']} />
          <Line type={lineType} dataKey="value" stroke={color} strokeWidth={2} dot={false} />
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
function isBinarySeries(s: OverlaySeries): boolean {
  return s.data.length > 0 && s.data.every((p) => p.value === 0 || p.value === 1);
}

export function OverlayChart({ series, height = 280 }: { series: OverlaySeries[]; height?: number }) {
  const allTimes = series.flatMap((s) => s.data.map((p) => p.time));
  const xTicks = useMemo(() => {
    if (allTimes.length === 0) return [];
    return buildTimeTicks(Math.min(...allTimes), Math.max(...allTimes));
  }, [allTimes]);

  // Une série binaire (0/1) superposée à des capteurs continus (ex. température)
  // resterait plate et illisible sur sa propre échelle 0-1 à côté de valeurs qui
  // oscillent entre 15 et 30 : on la redimensionne donc visuellement sur la plage
  // observée des séries continues du groupe (0 -> minimum observé, 1 -> maximum
  // observé), tout en gardant la vraie valeur 0/1 pour l'infobulle via `raw`.
  const continuousValues = useMemo(
    () => series.filter((s) => !isBinarySeries(s)).flatMap((s) => s.data.map((p) => p.value)),
    [series],
  );
  const hasContinuous = continuousValues.length > 0;
  const continuousMin = hasContinuous ? Math.min(...continuousValues) : 0;
  const continuousMax = hasContinuous ? Math.max(...continuousValues) : 1;

  const plotSeries = useMemo(
    () =>
      series.map((s) => {
        const binary = isBinarySeries(s);
        const rescaled = binary && hasContinuous;
        return {
          ...s,
          binary,
          rescaled,
          data: s.data.map((p) => ({
            time: p.time,
            value: rescaled ? (p.value === 1 ? continuousMax : continuousMin) : p.value,
            raw: p.value,
          })),
        };
      }),
    [series, hasContinuous, continuousMin, continuousMax],
  );

  // Unités : une série redimensionnée partage toujours l'axe gauche (celui des
  // séries continues) plutôt que d'être traitée comme sa propre unité.
  const nonRescaledUnits = plotSeries.filter((s) => !s.rescaled).map((s) => getValueMeta(s.valueKey).unit);
  const primaryUnit = nonRescaledUnits[0];
  const secondaryUnit = nonRescaledUnits.find((u) => u !== primaryUnit);
  const yAxisIdFor = (s: (typeof plotSeries)[number]) =>
    !s.rescaled && secondaryUnit !== undefined && getValueMeta(s.valueKey).unit !== primaryUnit ? 'right' : 'left';
  const formatAxisValue = (unit: string) => (v: number) => `${v}${unit ? ` ${unit}` : ''}`;

  // Sans domaine explicite, Recharts force l'axe Y à démarrer à 0 par défaut — ce qui
  // écrase une bonne partie du graphique si les valeurs réelles restent loin de 0 (ex.
  // des températures qui oscillent entre 15 et 30°C). On recalcule donc le domaine à
  // partir des valeurs effectivement affichées sur chaque axe, comme pour ValueChart.
  const axisValues = (axisId: 'left' | 'right') =>
    plotSeries.filter((s) => yAxisIdFor(s) === axisId).flatMap((s) => s.data.map((p) => p.value));

  const buildAxis = (values: number[]) => {
    if (values.length === 0) return { ticks: undefined, domain: ['auto', 'auto'] as [string, string] };
    if (values.every((v) => v === 0 || v === 1)) return { ticks: [0, 1], domain: [0, 1] as [number, number] };
    return buildValueTicks(Math.min(...values), Math.max(...values));
  };

  const leftAxis = useMemo(() => buildAxis(axisValues('left')), [plotSeries, secondaryUnit]);
  const rightAxis = useMemo(() => buildAxis(axisValues('right')), [plotSeries, secondaryUnit]);

  const labelToSeries = new Map(plotSeries.map((s) => [s.label, s]));

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
        {secondaryUnit !== undefined && (
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
          formatter={(value, name, entry: any) => {
            const raw = entry?.payload?.raw;
            const s = labelToSeries.get(name as string);
            if (s?.binary) return [raw === 1 ? 'Marche' : 'Arrêt', name];
            const unit = s ? getValueMeta(s.valueKey).unit : '';
            return [formatAxisValue(unit)(raw ?? (value as number)), name];
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {plotSeries.map((s) => (
          <Line
            key={s.id}
            data={s.data}
            dataKey="value"
            name={s.label}
            stroke={s.color}
            strokeWidth={2}
            dot={false}
            type={s.binary ? 'stepAfter' : 'monotone'}
            yAxisId={yAxisIdFor(s)}
          />
        ))}
        <Brush dataKey="time" height={24} tickFormatter={formatDate} travellerWidth={8} />
      </LineChart>
    </ResponsiveContainer>
  );
}
