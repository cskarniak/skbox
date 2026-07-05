// crypto.randomUUID() exige un contexte sécurisé (HTTPS/localhost) ; indisponible en HTTP sur le LAN.
export function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface DeviceEvent {
  id: string;
  data: string;
  timestamp: string;
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

export function buildSeries(history: DeviceEvent[], valueKey: string) {
  return history
    .map((entry) => {
      let value: number | null = null;
      try {
        const parsed = JSON.parse(entry.data) as Record<string, unknown>;
        value = coerceValue(parsed[valueKey]);
      } catch {
        value = null;
      }
      return value === null ? null : { time: new Date(entry.timestamp).getTime(), value };
    })
    .filter((point): point is { time: number; value: number } => point !== null);
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

// Graduations régulières sur l'axe du temps, espacées de `stepMs`, plutôt que le
// pas variable calculé automatiquement par la librairie de graphiques.
export function buildTimeTicks(minMs: number, maxMs: number, stepMs: number): number[] {
  if (!Number.isFinite(minMs) || !Number.isFinite(maxMs) || maxMs <= minMs) return [minMs];
  const ticks: number[] = [];
  for (let t = minMs; t < maxMs; t += stepMs) ticks.push(t);
  ticks.push(maxMs);
  return ticks;
}

// Graduations régulières sur l'axe des valeurs, espacées de `step` (ex: 5°C).
export function buildStepTicks(minVal: number, maxVal: number, step: number): { ticks: number[]; domain: [number, number] } {
  const lo = Math.floor(minVal / step) * step;
  const hi = Math.ceil(maxVal / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi; v += step) ticks.push(v);
  return { ticks, domain: [lo, hi] };
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
