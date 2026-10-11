import { describe, expect, it } from 'vitest';
import { computeDailyEnergy, MeterSample } from './energy-consumption';

const at = (iso: string) => new Date(iso);
const s = (iso: string, energyWh: number | null, powerW: number | null = null): MeterSample => ({
  timestamp: at(iso),
  energyWh,
  powerW,
});

describe('computeDailyEnergy', () => {
  const now = at('2026-10-11T23:00:00');

  it('calcule la consommation du jour à partir de la différence du compteur', () => {
    const r = computeDailyEnergy(
      [s('2026-10-11T08:00:00', 1_000_000), s('2026-10-11T12:00:00', 1_003_000), s('2026-10-11T20:00:00', 1_008_000)],
      2,
      now,
    );
    expect(r.map((d) => d.date)).toEqual(['2026-10-10', '2026-10-11']);
    expect(r[1].kwh).toBe(8);
    expect(r[0].kwh).toBe(0);
  });

  it('répartit au prorata du temps un intervalle à cheval sur minuit', () => {
    const r = computeDailyEnergy([s('2026-10-10T22:00:00', 0), s('2026-10-11T02:00:00', 4000)], 2, now);
    expect(r[0].kwh).toBe(2); // 22h-minuit : 2 h sur 4 h
    expect(r[1].kwh).toBe(2);
  });

  it('reprend la mesure antérieure à la fenêtre pour ne pas perdre le début de période', () => {
    const r = computeDailyEnergy([s('2026-10-10T20:00:00', 500_000), s('2026-10-11T04:00:00', 508_000)], 1, now);
    expect(r[0].kwh).toBe(4); // moitié de l'intervalle de 8 h tombe dans la journée du 11
  });

  it('ignore un 0 isolé du compteur et rattrape la consommation avec le relevé suivant', () => {
    const r = computeDailyEnergy(
      [
        s('2026-10-11T10:00:00', 798_000),
        s('2026-10-11T10:10:00', 0), // valeur aberrante
        s('2026-10-11T10:20:00', 798_300),
        s('2026-10-11T10:30:00', 798_400),
      ],
      1,
      now,
    );
    expect(r[0].kwh).toBe(0.4);
  });

  it('ignore un pic invraisemblable (78 milliards) du compteur', () => {
    const r = computeDailyEnergy(
      [
        s('2026-10-11T17:00:00', 889_940),
        s('2026-10-11T17:13:00', 78_346_581_812),
        s('2026-10-11T17:14:00', 890_052),
      ],
      1,
      now,
    );
    expect(r[0].kwh).toBe(0.11);
  });

  it('repart de la nouvelle valeur quand le compteur a vraiment redémarré', () => {
    const r = computeDailyEnergy(
      [
        s('2026-10-11T08:00:00', 900_000),
        s('2026-10-11T09:00:00', 900_500),
        s('2026-10-11T10:00:00', 100), // redémarrage
        s('2026-10-11T11:00:00', 600),
        s('2026-10-11T12:00:00', 1100),
        s('2026-10-11T13:00:00', 1600),
      ],
      1,
      now,
    );
    // 500 avant le redémarrage + intervalles 100->600->1100->1600 après (l'intervalle du redémarrage est perdu)
    expect(r[0].kwh).toBe(2);
  });

  it('relève la puissance maximale du jour en écartant les valeurs aberrantes', () => {
    const r = computeDailyEnergy(
      [s('2026-10-11T08:00:00', null, 400), s('2026-10-11T09:00:00', null, 4200), s('2026-10-11T10:00:00', null, 99_999)],
      1,
      now,
    );
    expect(r[0].peakW).toBe(4200);
  });

  it('renvoie des jours à zéro sans relevé', () => {
    const r = computeDailyEnergy([], 3, now);
    expect(r).toHaveLength(3);
    expect(r.every((d) => d.kwh === 0 && d.peakW === null)).toBe(true);
  });
});
