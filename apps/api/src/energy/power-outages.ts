export interface PowerReading {
  timestamp: Date;
  powerW: number | null;
}

// Un relevé à 0 W, de sa première occurrence au premier relevé de nouveau normal.
export interface PowerRun {
  start: Date;
  end: Date | null; // null : toujours à 0 W
}

export interface AvailabilityDrop {
  deviceName: string;
  at: Date;
}

// « confirmed » : des appareils branchés sur le secteur sont passés hors ligne au même moment ;
// « unverified » : coupure plausible mais antérieure à l'enregistrement des disponibilités ;
// « pending » : coupure qui vient de commencer, les appareils n'ont pas encore été déclarés hors ligne.
export type OutageStatus = 'confirmed' | 'unverified' | 'pending';

export interface PowerOutage {
  startedAt: string;
  endedAt: string | null; // null si la coupure est en cours
  durationMinutes: number;
  ongoing: boolean;
  status: OutageStatus;
  devicesOffline: string[];
}

// Le compteur est considéré hors tension en dessous de ce seuil (consommation de veille de la maison :
// plus de 170 W en temps normal).
export const OUTAGE_POWER_THRESHOLD_W = 5;
// Sans corroboration possible (avant l'enregistrement des disponibilités), une coupure plus courte est
// ignorée : le compteur émet parfois un 0 W isolé (parasite radio) suivi d'une valeur normale moins
// d'une minute plus tard.
export const OUTAGE_MIN_MINUTES = 2;
// Zigbee2MQTT déclare un appareil hors ligne après un ping resté sans réponse (vérification toutes les
// 5 min) : on cherche les appareils devenus muets de 1 min avant à 6 min après le début du 0 W.
const CORROBORATION_BEFORE_MS = 60_000;
const CORROBORATION_AFTER_MS = 6 * 60_000;
const MAX_PLAUSIBLE_POWER_W = 30_000;

/**
 * Séries de relevés à 0 W du compteur du tableau. L'historique n'enregistre qu'un changement de plus de
 * 20 W : un 0 W stable n'écrit rien jusqu'au retour du courant, et la série va du premier relevé à 0 W
 * au premier relevé normal suivant. `readings` doit contenir chaque 0 W suivi de ses relevés suivants.
 */
export function computePowerRuns(readings: PowerReading[]): PowerRun[] {
  const sorted = [...readings]
    .filter((r) => r.powerW !== null && r.powerW >= 0 && r.powerW <= MAX_PLAUSIBLE_POWER_W)
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  const runs: PowerRun[] = [];
  let start: Date | null = null;
  for (const r of sorted) {
    const off = (r.powerW as number) <= OUTAGE_POWER_THRESHOLD_W;
    if (off && !start) start = r.timestamp;
    else if (!off && start) {
      runs.push({ start, end: r.timestamp });
      start = null;
    }
  }
  if (start) runs.push({ start, end: null });
  return runs;
}

/**
 * Distingue une vraie coupure d'un parasite radio : pendant une coupure, les appareils branchés sur le
 * secteur (hors onduleur) deviennent muets ; pendant un parasite, ils restent actifs.
 * `trackingStart` : début de l'enregistrement des disponibilités (null s'il n'a pas commencé) ; avant,
 * on ne peut pas corroborer et on se rabat sur la durée minimale.
 */
export function classifyOutages(
  runs: PowerRun[],
  drops: AvailabilityDrop[],
  trackingStart: Date | null,
  now: Date,
): { outages: PowerOutage[]; discarded: number } {
  const outages: PowerOutage[] = [];
  let discarded = 0;

  for (const run of runs) {
    const from = run.start.getTime() - CORROBORATION_BEFORE_MS;
    const to = run.start.getTime() + CORROBORATION_AFTER_MS;
    const devicesOffline = [
      ...new Set(drops.filter((d) => d.at.getTime() >= from && d.at.getTime() <= to).map((d) => d.deviceName)),
    ];
    const endMs = (run.end ?? now).getTime();
    const minutes = (endMs - run.start.getTime()) / 60_000;
    const tracked = trackingStart !== null && run.start.getTime() >= trackingStart.getTime();

    let status: OutageStatus | null;
    if (devicesOffline.length > 0) status = 'confirmed';
    else if (!tracked) status = minutes >= OUTAGE_MIN_MINUTES ? 'unverified' : null;
    else if (run.end === null && now.getTime() - run.start.getTime() < CORROBORATION_AFTER_MS) status = 'pending';
    else status = null; // suivi actif et aucun appareil n'a décroché : parasite

    if (status === null) {
      discarded++;
      continue;
    }
    outages.push({
      startedAt: run.start.toISOString(),
      endedAt: run.end ? run.end.toISOString() : null,
      durationMinutes: Math.round(minutes * 10) / 10,
      ongoing: run.end === null,
      status,
      devicesOffline,
    });
  }
  return { outages, discarded };
}
