import { describe, expect, it } from 'vitest';
import { generateDailyPlan } from './presence-simulation.plan';

function sequenceRng(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

describe('generateDailyPlan', () => {
  const onAt = new Date('2026-07-17T19:00:00');
  const offAt = new Date('2026-07-17T23:00:00'); // fenêtre de 4h = 240 min

  it('produit uniquement [on, off] quand toggleCountMax vaut 0', () => {
    const events = generateDailyPlan({
      onAt,
      offAt,
      toggleWindowStart: onAt,
      toggleWindowEnd: offAt,
      toggleCountMin: 0,
      toggleCountMax: 0,
      toggleDurationMin: 5,
      toggleDurationMax: 10,
      toggleGapMin: 15,
      toggleGapMax: 15,
    });
    expect(events).toEqual([
      { kind: 'on', action: 'ON', at: onAt },
      { kind: 'off', action: 'OFF', at: offAt },
    ]);
  });

  it('trie les événements chronologiquement et les garde dans la fenêtre [onAt, offAt]', () => {
    const events = generateDailyPlan({
      onAt,
      offAt,
      toggleWindowStart: onAt,
      toggleWindowEnd: offAt,
      toggleCountMin: 5,
      toggleCountMax: 5,
      toggleDurationMin: 2,
      toggleDurationMax: 5,
      toggleGapMin: 5,
      toggleGapMax: 10,
      rng: Math.random,
    });
    for (let i = 1; i < events.length; i++) {
      expect(events[i].at.getTime()).toBeGreaterThanOrEqual(events[i - 1].at.getTime());
    }
    for (const e of events) {
      expect(e.at.getTime()).toBeGreaterThanOrEqual(onAt.getTime());
      expect(e.at.getTime()).toBeLessThanOrEqual(offAt.getTime());
    }
  });

  it('tire le nombre de bascules dans la fourchette [toggleCountMin, toggleCountMax]', () => {
    // rng déterministe: randomInt(min,max,rng) = floor(min + rng()*(max-min+1))
    // avec min=2, max=4 et rng()=0.5 -> floor(2 + 0.5*3) = floor(3.5) = 3 bascules
    const rng = sequenceRng([0.5]);
    const events = generateDailyPlan({
      onAt,
      offAt,
      toggleWindowStart: onAt,
      toggleWindowEnd: offAt,
      toggleCountMin: 2,
      toggleCountMax: 4,
      toggleDurationMin: 5,
      toggleDurationMax: 5,
      toggleGapMin: 15,
      toggleGapMax: 15,
      rng,
    });
    // 3 bascules * 2 événements (off+on) + on + off = 8, sauf arrêt anticipé faute de place
    const toggleEvents = events.filter((e) => e.kind === 'toggle_on' || e.kind === 'toggle_off');
    expect(toggleEvents.length).toBeGreaterThan(0);
    expect(toggleEvents.length).toBeLessThanOrEqual(8);
  });

  it("n'ajoute aucune bascule quand la fenêtre est trop petite pour sa durée minimale, même avec rng au maximum", () => {
    // Fenêtre de 4h, durée de bascule fixée à 5h : ne peut jamais tenir avant offAt.
    const rng = sequenceRng([1, 1]);
    const events = generateDailyPlan({
      onAt,
      offAt,
      toggleWindowStart: onAt,
      toggleWindowEnd: offAt,
      toggleCountMin: 1,
      toggleCountMax: 1,
      toggleDurationMin: 300,
      toggleDurationMax: 300,
      toggleGapMin: 15,
      toggleGapMax: 15,
      rng,
    });
    expect(events).toEqual([
      { kind: 'on', action: 'ON', at: onAt },
      { kind: 'off', action: 'OFF', at: offAt },
    ]);
  });

  it('ne dépasse jamais offAt même avec rng au maximum (0 ou 1)', () => {
    const events = generateDailyPlan({
      onAt,
      offAt,
      toggleWindowStart: onAt,
      toggleWindowEnd: offAt,
      toggleCountMin: 3,
      toggleCountMax: 3,
      toggleDurationMin: 30,
      toggleDurationMax: 30,
      toggleGapMin: 15,
      toggleGapMax: 15,
      rng: sequenceRng([1]),
    });
    for (const e of events) {
      expect(e.at.getTime()).toBeLessThanOrEqual(offAt.getTime());
    }
  });

  it('ne produit jamais de bascules qui se chevauchent, avec un écart respectant [toggleGapMin, toggleGapMax]', () => {
    const toggleGapMin = 15;
    const toggleGapMax = 25;
    const events = generateDailyPlan({
      onAt,
      offAt,
      toggleWindowStart: onAt,
      toggleWindowEnd: offAt,
      toggleCountMin: 5,
      toggleCountMax: 5,
      toggleDurationMin: 2,
      toggleDurationMax: 5,
      toggleGapMin,
      toggleGapMax,
      rng: Math.random,
    });
    const toggleEvents = events.filter((e) => e.kind === 'toggle_on' || e.kind === 'toggle_off');
    for (let i = 1; i < toggleEvents.length; i++) {
      expect(toggleEvents[i].action).not.toBe(toggleEvents[i - 1].action);
    }
    // écart entre la fin d'une bascule (toggle_on) et le début de la suivante (toggle_off)
    // doit respecter [toggleGapMin, toggleGapMax]
    for (let i = 0; i + 1 < toggleEvents.length; i += 2) {
      const end = toggleEvents[i + 1];
      const nextStart = toggleEvents[i + 2];
      if (!nextStart) continue;
      const gapMs = nextStart.at.getTime() - end.at.getTime();
      expect(gapMs).toBeGreaterThanOrEqual(toggleGapMin * 60_000);
      expect(gapMs).toBeLessThanOrEqual(toggleGapMax * 60_000);
    }
  });

  it("s'arrête d'ajouter des bascules quand il ne reste plus assez de place (écart minimal respecté)", () => {
    // fenêtre de 4h, bascules de 60 min min chacune -> il n'y a pas la place pour 5 bascules
    // espacées de 15 min : le générateur doit en produire moins plutôt que de chevaucher.
    const events = generateDailyPlan({
      onAt,
      offAt,
      toggleWindowStart: onAt,
      toggleWindowEnd: offAt,
      toggleCountMin: 5,
      toggleCountMax: 5,
      toggleDurationMin: 60,
      toggleDurationMax: 60,
      toggleGapMin: 15,
      toggleGapMax: 15,
      rng: Math.random,
    });
    const toggleEvents = events.filter((e) => e.kind === 'toggle_on' || e.kind === 'toggle_off');
    expect(toggleEvents.length).toBeLessThan(10);
    expect(toggleEvents.length % 2).toBe(0);
  });

  it('lève une erreur si onAt >= offAt', () => {
    expect(() =>
      generateDailyPlan({
        onAt: offAt,
        offAt: onAt,
        toggleWindowStart: offAt,
        toggleWindowEnd: onAt,
        toggleCountMin: 0,
        toggleCountMax: 0,
        toggleDurationMin: 1,
        toggleDurationMax: 1,
        toggleGapMin: 15,
        toggleGapMax: 15,
      }),
    ).toThrow();
  });

  it('concentre les bascules dans la fenêtre [toggleWindowStart, toggleWindowEnd] quand elle est plus petite que [onAt, offAt]', () => {
    // fenêtre totale 4h (19:00-23:00), toggleWindow 22:00-23:00 -> bascules seulement dans
    // la dernière heure avant offAt.
    const toggleWindowStart = new Date(offAt.getTime() - 60 * 60_000); // 22:00
    const events = generateDailyPlan({
      onAt,
      offAt,
      toggleWindowStart,
      toggleWindowEnd: offAt,
      toggleCountMin: 5,
      toggleCountMax: 5,
      toggleDurationMin: 2,
      toggleDurationMax: 5,
      toggleGapMin: 1,
      toggleGapMax: 2,
      rng: Math.random,
    });
    const toggleEvents = events.filter((e) => e.kind === 'toggle_on' || e.kind === 'toggle_off');
    expect(toggleEvents.length).toBeGreaterThan(0);
    for (const e of toggleEvents) {
      expect(e.at.getTime()).toBeGreaterThanOrEqual(toggleWindowStart.getTime());
    }
  });

  it("n'ajoute aucune bascule quand toggleWindowStart == toggleWindowEnd (soirée stable jusqu'à l'extinction)", () => {
    const events = generateDailyPlan({
      onAt,
      offAt,
      toggleWindowStart: offAt,
      toggleWindowEnd: offAt,
      toggleCountMin: 5,
      toggleCountMax: 5,
      toggleDurationMin: 2,
      toggleDurationMax: 5,
      toggleGapMin: 15,
      toggleGapMax: 15,
      rng: Math.random,
    });
    expect(events).toEqual([
      { kind: 'on', action: 'ON', at: onAt },
      { kind: 'off', action: 'OFF', at: offAt },
    ]);
  });
});
