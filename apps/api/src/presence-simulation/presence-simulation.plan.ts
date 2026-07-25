export type PlannedEventKind = 'on' | 'off' | 'toggle_on' | 'toggle_off';

export interface PlannedEvent {
  kind: PlannedEventKind;
  action: 'ON' | 'OFF';
  at: Date;
}

export interface PlanInput {
  onAt: Date;
  offAt: Date;
  toggleWindowStart: Date; // début de la fenêtre où les bascules peuvent survenir ; le reste de la soirée reste stable
  toggleWindowEnd: Date; // fin de cette fenêtre
  toggleCountMin: number;
  toggleCountMax: number;
  toggleDurationMin: number; // minutes
  toggleDurationMax: number; // minutes
  toggleGapMin: number; // minutes, écart minimal entre la fin d'une bascule et le début de la suivante
  toggleGapMax: number; // minutes
  rng?: () => number; // défaut Math.random, injectable pour des tests déterministes
}

function randomInt(min: number, max: number, rng: () => number): number {
  if (max <= min) return min;
  return Math.floor(min + rng() * (max - min + 1));
}

/**
 * Calcule le plan d'événements d'une simulation de présence pour une fenêtre on/off donnée :
 * un allumage initial, un nombre aléatoire de bascules extinction/rallumage temporaires de
 * durée aléatoire, et l'extinction finale. Fonction pure (aucun accès Prisma/MQTT) pour rester
 * facilement testable.
 */
export function generateDailyPlan(input: PlanInput): PlannedEvent[] {
  const {
    onAt, offAt, toggleWindowStart, toggleWindowEnd,
    toggleCountMin, toggleCountMax, toggleDurationMin, toggleDurationMax, toggleGapMin, toggleGapMax,
  } = input;
  const rng = input.rng ?? Math.random;
  if (!(onAt.getTime() < offAt.getTime())) {
    throw new Error('onAt doit être strictement antérieur à offAt');
  }

  const count = randomInt(toggleCountMin, toggleCountMax, rng);
  // Les bascules ne sont tirées que dans la fenêtre configurée (par ex. les dernières heures
  // avant le coucher), pas sur toute la soirée : le début de soirée reste stable une fois la
  // lumière allumée. La fenêtre configurée est plafonnée à [onAt, offAt] au cas où elle
  // déborderait de la fenêtre réelle (décalages aléatoires, etc.).
  const toggleStartMs = Math.max(onAt.getTime(), toggleWindowStart.getTime());
  const toggleEndMs = Math.min(offAt.getTime(), toggleWindowEnd.getTime());

  // Placement séquentiel : chaque bascule démarre après la fin de la précédente + un écart
  // aléatoire dans [toggleGapMin, toggleGapMax], ce qui garantit par construction l'absence de
  // chevauchement, sans avoir besoin de fusionner après coup des événements qui se chevaucheraient.
  const toggles: PlannedEvent[] = [];
  let cursorMs = toggleStartMs;
  for (let i = 0; i < count; i++) {
    const durationMs = randomInt(toggleDurationMin, toggleDurationMax, rng) * 60_000;
    const latestStartMs = toggleEndMs - durationMs;
    if (latestStartMs < cursorMs) break; // plus de place pour une bascule complète sans chevaucher

    const startMs = cursorMs + rng() * (latestStartMs - cursorMs);
    const endMs = startMs + durationMs;
    toggles.push({ kind: 'toggle_off', action: 'OFF', at: new Date(startMs) });
    toggles.push({ kind: 'toggle_on', action: 'ON', at: new Date(endMs) });
    const gapMs = randomInt(toggleGapMin, toggleGapMax, rng) * 60_000;
    cursorMs = endMs + gapMs;
  }

  return [{ kind: 'on', action: 'ON', at: onAt }, ...toggles, { kind: 'off', action: 'OFF', at: offAt }];
}
