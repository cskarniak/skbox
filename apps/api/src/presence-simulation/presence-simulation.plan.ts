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
  const { onAt, offAt, toggleWindowStart, toggleWindowEnd, toggleCountMin, toggleCountMax, toggleDurationMin, toggleDurationMax } = input;
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
  const toggleStart = new Date(toggleStartMs);
  const windowMs = Math.max(0, toggleEndMs - toggleStartMs);

  const toggles: PlannedEvent[] = [];
  for (let i = 0; i < count; i++) {
    const startAt = new Date(toggleStart.getTime() + rng() * windowMs);
    const durationMs = randomInt(toggleDurationMin, toggleDurationMax, rng) * 60_000;
    const endAt = new Date(startAt.getTime() + durationMs);
    // Une bascule dont le rallumage tomberait après (ou pile sur) l'extinction finale n'a
    // pas vraiment de "retour à la normale" observable — on la supprime plutôt que de la
    // tronquer, pour ne pas laisser un événement de fin fantôme dans le journal.
    if (endAt.getTime() >= offAt.getTime()) continue;
    toggles.push({ kind: 'toggle_off', action: 'OFF', at: startAt });
    toggles.push({ kind: 'toggle_on', action: 'ON', at: endAt });
  }

  toggles.sort((a, b) => a.at.getTime() - b.at.getTime());

  const events: PlannedEvent[] = [
    { kind: 'on', action: 'ON', at: onAt },
    ...toggles,
    { kind: 'off', action: 'OFF', at: offAt },
  ];

  // Des bascules qui se chevauchent produisent des paires consécutives de même action
  // (OFF→OFF, ON→ON), qui ne changeraient rien à l'état réel de la lampe et ne feraient
  // que polluer le journal — on les fusionne en gardant la première occurrence.
  return events.filter((event, i) => i === 0 || event.action !== events[i - 1].action);
}
