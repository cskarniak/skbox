// Champs qui varient en permanence sans intérêt pour l'historique (force du signal) —
// les ignorer évite de créer un DeviceEvent à chaque message d'un appareil bavard.
const VOLATILE_KEYS = new Set(['linkquality', 'rssi']);

export function hasSignificantChange(
  previousStateJson: string | null | undefined,
  nextState: Record<string, unknown>,
): boolean {
  let previous: Record<string, unknown>;
  try {
    previous = previousStateJson ? JSON.parse(previousStateJson) : {};
  } catch {
    previous = {};
  }

  const keys = new Set([...Object.keys(previous), ...Object.keys(nextState)]);
  for (const key of keys) {
    if (VOLATILE_KEYS.has(key)) continue;
    if (previous[key] !== nextState[key]) return true;
  }
  return false;
}
