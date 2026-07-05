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
