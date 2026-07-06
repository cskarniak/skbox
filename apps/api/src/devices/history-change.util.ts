import { HistoryFieldConfigEntry } from '@skbox/shared';

// Champs qui varient en permanence sans intérêt pour l'historique (force du signal) —
// ignorés par défaut tant que l'utilisateur n'a pas explicitement configuré cette clé
// (auquel cas sa config a priorité, y compris pour les réactiver).
const DEFAULT_IGNORED_KEYS = new Set(['linkquality', 'rssi']);

export function hasSignificantChange(
  previousStateJson: string | null | undefined,
  nextState: Record<string, unknown>,
  configJson?: string | null,
): boolean {
  let previous: Record<string, unknown>;
  try {
    previous = previousStateJson ? JSON.parse(previousStateJson) : {};
  } catch {
    previous = {};
  }

  let config: HistoryFieldConfigEntry[];
  try {
    config = configJson ? JSON.parse(configJson) : [];
  } catch {
    config = [];
  }
  const configByKey = new Map(config.map((entry) => [entry.valueKey, entry]));

  const keys = new Set([...Object.keys(previous), ...Object.keys(nextState)]);
  for (const key of keys) {
    const entry = configByKey.get(key);
    if (entry) {
      if (!entry.enabled) continue;
    } else if (DEFAULT_IGNORED_KEYS.has(key)) {
      continue;
    }

    const prevVal = previous[key];
    const nextVal = nextState[key];

    if (entry?.minDelta && typeof prevVal === 'number' && typeof nextVal === 'number') {
      if (Math.abs(nextVal - prevVal) < entry.minDelta) continue;
      return true;
    }

    if (prevVal !== nextVal) return true;
  }
  return false;
}
