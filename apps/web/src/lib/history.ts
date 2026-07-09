// crypto.randomUUID() exige un contexte sécurisé (HTTPS/localhost) ; indisponible en HTTP sur le LAN.
export function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface DeviceEvent {
  id: string;
  data: string;
  timestamp: string;
}

export type DisplayType = 'value' | 'chart' | 'table';
export type ChartType = 'line' | 'bar' | 'area';

export interface DisplayPreference {
  valueKey: string;
  displayType: DisplayType;
  chartType?: ChartType;
}

export function parseDisplayPreferences(raw: string | null | undefined): DisplayPreference[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export interface HistoryFieldConfig {
  valueKey: string;
  enabled: boolean;
  minDelta?: number;
}

export function parseHistoryFieldConfig(raw: string | null | undefined): HistoryFieldConfig[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function latestValue(history: DeviceEvent[], valueKey: string): number | null {
  for (let i = history.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(history[i].data) as Record<string, unknown>;
      const value = coerceValue(parsed[valueKey]);
      if (value !== null) return value;
    } catch {
      // ignore
    }
  }
  return null;
}

// Ordre catégoriel fixe (jamais cyclé au hasard) — palette validée CVD, variante dark.
export const CHART_COLORS = [
  '#3987e5',
  '#199e70',
  '#c98500',
  '#008300',
  '#9085e9',
  '#e66767',
  '#d55181',
  '#d95926',
];

export function coerceValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string') {
    if (value === 'ON' || value === 'true') return 1;
    if (value === 'OFF' || value === 'false') return 0;
  }
  return null;
}

export function extractValueKeys(history: DeviceEvent[]): string[] {
  const keys = new Set<string>();
  for (const entry of history) {
    try {
      const parsed = JSON.parse(entry.data) as Record<string, unknown>;
      for (const [key, value] of Object.entries(parsed)) {
        if (coerceValue(value) !== null) keys.add(key);
      }
    } catch {
      // ignore
    }
  }
  return [...keys].sort();
}

export interface ScenarioTriggerContext {
  scenarioName: string;
  values: { deviceName: string; property: string; value: unknown }[];
}

export interface SeriesPoint {
  time: number;
  value: number;
  scenario?: ScenarioTriggerContext;
}

export function buildSeries(history: DeviceEvent[], valueKey: string): SeriesPoint[] {
  return history
    .map((entry) => {
      let value: number | null = null;
      let scenario: ScenarioTriggerContext | undefined;
      try {
        const parsed = JSON.parse(entry.data) as Record<string, unknown>;
        value = coerceValue(parsed[valueKey]);
        scenario = parsed._scenario as ScenarioTriggerContext | undefined;
      } catch {
        value = null;
      }
      return value === null ? null : { time: new Date(entry.timestamp).getTime(), value, scenario };
    })
    .filter((point): point is NonNullable<typeof point> => point !== null);
}

export function formatTime(ms: number) {
  return new Date(ms).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDate(ms: number) {
  return new Date(ms).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}

export function formatDateTime(ms: number) {
  return new Date(ms).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// Pas "rond" le plus proche (1/2/5 × une puissance de 10) pour un pas brut donné —
// algorithme standard de graduation d'axe (Heckbert), pour que l'écart entre
// graduations s'adapte à l'amplitude réelle des données plutôt que d'être figé.
function niceStep(rawStep: number): number {
  if (rawStep <= 0) return 1;
  const exponent = Math.floor(Math.log10(rawStep));
  const magnitude = Math.pow(10, exponent);
  const fraction = rawStep / magnitude;
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return niceFraction * magnitude;
}

// Graduations régulières sur l'axe des valeurs, avec un pas rond (1/2/5/10…) choisi
// pour viser ~targetCount graduations sur l'amplitude réelle (ex: 1°C si la
// variation est faible, 5°C si elle est large) — au lieu d'un pas figé.
export function buildValueTicks(
  minVal: number,
  maxVal: number,
  targetCount = 5,
): { ticks: number[]; domain: [number, number] } {
  if (minVal === maxVal) return { ticks: [minVal], domain: [minVal, minVal] };
  const step = niceStep((maxVal - minVal) / targetCount);
  const lo = Math.floor(minVal / step) * step;
  const hi = Math.ceil(maxVal / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { ticks, domain: [lo, hi] };
}

const TIME_STEPS_MS = [
  30 * 60_000,
  3600_000,
  3 * 3600_000,
  6 * 3600_000,
  12 * 3600_000,
  24 * 3600_000,
  2 * 24 * 3600_000,
  7 * 24 * 3600_000,
  14 * 24 * 3600_000,
  30 * 24 * 3600_000,
  90 * 24 * 3600_000,
  365 * 24 * 3600_000,
];

// Graduations régulières sur l'axe du temps, avec un pas choisi parmi une liste de
// pas "ronds" (30 min, 1h, ..., 1 jour, 2 jours, 1 semaine, ...) pour viser
// ~targetCount graduations sur la période affichée — s'adapte à la plage visible
// (journalier sur une semaine, tous les 2 jours sur un mois, etc.).
export function buildTimeTicks(minMs: number, maxMs: number, targetCount = 6): number[] {
  if (!Number.isFinite(minMs) || !Number.isFinite(maxMs) || maxMs <= minMs) return [minMs];
  const rawStep = (maxMs - minMs) / targetCount;
  const step = TIME_STEPS_MS.find((candidate) => candidate >= rawStep) ?? TIME_STEPS_MS[TIME_STEPS_MS.length - 1];

  let start = minMs;
  if (step >= 24 * 3600_000) {
    const aligned = new Date(minMs);
    aligned.setHours(0, 0, 0, 0);
    start = aligned.getTime();
  }

  const ticks: number[] = [];
  for (let t = start; t <= maxMs; t += step) {
    if (t >= minMs) ticks.push(t);
  }
  if (ticks.length === 0 || ticks[ticks.length - 1] < maxMs) ticks.push(maxMs);
  return ticks;
}

const VALUE_META: Record<string, { label: string; unit: string }> = {
  temperature: { label: 'Température', unit: '°C' },
  humidity: { label: 'Humidité', unit: '%' },
  humidityStatus: { label: 'Statut humidité', unit: '' },
  battery: { label: 'Batterie', unit: '%' },
  linkquality: { label: 'Qualité de liaison', unit: '' },
  rssi: { label: 'RSSI', unit: 'dBm' },
  power: { label: 'Puissance', unit: 'W' },
  energy: { label: 'Énergie', unit: 'kWh' },
  voltage: { label: 'Tension', unit: 'V' },
  current: { label: 'Courant', unit: 'A' },
  brightness: { label: 'Luminosité', unit: '' },
  state: { label: 'État', unit: '' },
  occupancy: { label: 'Présence', unit: '' },
  contact: { label: 'Contact', unit: '' },
};

export function getValueMeta(key: string): { label: string; unit: string } {
  return VALUE_META[key] ?? { label: key, unit: '' };
}

export function formatValueLabel(key: string): string {
  const meta = getValueMeta(key);
  return meta.unit ? `${meta.label} (${meta.unit})` : meta.label;
}
