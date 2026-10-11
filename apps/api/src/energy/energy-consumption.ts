export interface MeterSample {
  timestamp: Date;
  energyWh: number | null; // compteur cumulé (Wh) ; null si le message ne contient que la puissance
  powerW: number | null;
}

export interface DailyEnergy {
  date: string; // "YYYY-MM-DD" local
  kwh: number;
  peakW: number | null; // puissance maximale relevée dans la journée
}

// Puissance maximale plausible d'un compteur résidentiel : au-delà, un écart de compteur ou une
// puissance est une valeur aberrante de la radio (le CM180 en émet occasionnellement, ex. 0 ou 78e9).
const MAX_PLAUSIBLE_POWER_W = 30_000;
// Échantillons consécutifs, cohérents entre eux mais incohérents avec le dernier bon : le compteur a
// réellement redémarré (changement de pile, remise à zéro), on repart de la nouvelle valeur.
const REBASE_AFTER = 3;

function dateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function energyWindowStart(now: Date, days: number): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));
}

function isPlausibleStep(from: { t: number; e: number }, to: { t: number; e: number }): boolean {
  const delta = to.e - from.e;
  const hours = Math.max(0, to.t - from.t) / 3_600_000;
  return delta >= 0 && delta <= MAX_PLAUSIBLE_POWER_W * hours + 1;
}

/**
 * Consommation électrique jour par jour à partir du compteur d'énergie cumulé du capteur. La
 * consommation entre deux relevés est la différence du compteur, répartie au prorata du temps sur
 * les jours traversés (minuit local). Les relevés aberrants (compteur qui retombe à 0, pic
 * invraisemblable) sont ignorés : le relevé suivant, cohérent, rattrape la consommation écoulée
 * entre-temps puisque le compteur est cumulatif. `samples` doit inclure, si elle existe, la dernière
 * mesure antérieure à la fenêtre pour ne pas perdre la consommation du début de période.
 */
export function computeDailyEnergy(samples: MeterSample[], days: number, now: Date): DailyEnergy[] {
  const buckets = Array.from({ length: days }, (_, i) => {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1 - i));
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1 - i) + 1);
    return { start: start.getTime(), end: end.getTime(), date: dateString(start), wh: 0, peak: null as number | null };
  });

  const addInterval = (from: { t: number; e: number }, to: { t: number; e: number }) => {
    const span = to.t - from.t;
    const delta = to.e - from.e;
    if (span <= 0) return;
    for (const b of buckets) {
      const overlap = Math.min(to.t, b.end) - Math.max(from.t, b.start);
      if (overlap > 0) b.wh += (delta * overlap) / span;
    }
  };

  const sorted = [...samples].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const nowMs = now.getTime();

  for (const s of sorted) {
    const t = s.timestamp.getTime();
    if (t > nowMs || s.powerW === null || s.powerW < 0 || s.powerW > MAX_PLAUSIBLE_POWER_W) continue;
    const bucket = buckets.find((b) => t >= b.start && t < b.end);
    if (bucket && (bucket.peak === null || s.powerW > bucket.peak)) bucket.peak = s.powerW;
  }

  let good: { t: number; e: number } | null = null;
  let rejected: { t: number; e: number }[] = [];
  for (const s of sorted) {
    if (s.energyWh === null || !Number.isFinite(s.energyWh) || s.timestamp.getTime() > nowMs) continue;
    const point = { t: s.timestamp.getTime(), e: s.energyWh };
    if (good === null) {
      good = point;
      continue;
    }
    if (isPlausibleStep(good, point)) {
      addInterval(good, point);
      good = point;
      rejected = [];
      continue;
    }
    rejected.push(point);
    const consistent =
      rejected.length >= REBASE_AFTER && rejected.every((p, i) => i === 0 || isPlausibleStep(rejected[i - 1], p));
    if (consistent) {
      good = rejected[0];
      for (const p of rejected.slice(1)) {
        addInterval(good, p);
        good = p;
      }
      rejected = [];
    }
  }

  return buckets.map((b) => ({ date: b.date, kwh: Math.round(b.wh / 10) / 100, peakW: b.peak === null ? null : Math.round(b.peak) }));
}
