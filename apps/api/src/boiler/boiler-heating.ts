export interface RelayTransition {
  timestamp: Date;
  state: 'ON' | 'OFF';
}

export interface DailyHeating {
  date: string; // "YYYY-MM-DD" local
  minutes: number; // temps de chauffe cumulé sur la journée
  cycles: number; // nombre d'allumages démarrés ce jour-là
}

function dateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Début de la fenêtre : minuit local du premier jour affiché (aujourd'hui inclus dans `days`).
export function heatingWindowStart(now: Date, days: number): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));
}

/**
 * Temps de chauffe jour par jour à partir des transitions ON/OFF du relais. `initialState` est
 * l'état du relais juste avant le début de la fenêtre (dernier événement antérieur), sans quoi
 * une chauffe démarrée la veille de la fenêtre serait ignorée. Une période encore en cours est
 * comptée jusqu'à `now`. Les journées sont découpées à minuit local (les périodes à cheval sur
 * minuit sont réparties sur les deux jours).
 */
export function computeDailyHeating(
  transitions: RelayTransition[],
  initialState: 'ON' | 'OFF' | null,
  days: number,
  now: Date,
): DailyHeating[] {
  const windowStart = heatingWindowStart(now, days);
  const buckets = Array.from({ length: days }, (_, i) => {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1 - i));
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1 - i) + 1);
    return { start, end, date: dateString(start), ms: 0, cycles: 0 };
  });

  const addInterval = (from: Date, to: Date) => {
    for (const b of buckets) {
      const overlap = Math.min(to.getTime(), b.end.getTime()) - Math.max(from.getTime(), b.start.getTime());
      if (overlap > 0) b.ms += overlap;
    }
  };

  let onSince: Date | null = initialState === 'ON' ? windowStart : null;
  const sorted = [...transitions].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  for (const t of sorted) {
    if (t.timestamp < windowStart || t.timestamp > now) continue;
    if (t.state === 'ON' && onSince === null) {
      onSince = t.timestamp;
      const bucket = buckets.find((b) => t.timestamp >= b.start && t.timestamp < b.end);
      if (bucket) bucket.cycles++;
    } else if (t.state === 'OFF' && onSince !== null) {
      addInterval(onSince, t.timestamp);
      onSince = null;
    }
  }
  if (onSince !== null) addInterval(onSince, now);

  return buckets.map((b) => ({ date: b.date, minutes: Math.round(b.ms / 60_000), cycles: b.cycles }));
}
