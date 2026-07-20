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
      toggleWindowMinutes: 240,
      toggleCountMin: 0,
      toggleCountMax: 0,
      toggleDurationMin: 5,
      toggleDurationMax: 10,
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
      toggleWindowMinutes: 240,
      toggleCountMin: 5,
      toggleCountMax: 5,
      toggleDurationMin: 2,
      toggleDurationMax: 5,
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
      toggleWindowMinutes: 240,
      toggleCountMin: 2,
      toggleCountMax: 4,
      toggleDurationMin: 5,
      toggleDurationMax: 5,
      rng,
    });
    // 3 bascules * 2 événements (off+on) + on + off = 8, sauf fusion de bascules consécutives
    const toggleEvents = events.filter((e) => e.kind === 'toggle_on' || e.kind === 'toggle_off');
    expect(toggleEvents.length).toBeGreaterThan(0);
    expect(toggleEvents.length).toBeLessThanOrEqual(8);
  });

  it('supprime une bascule dont le rallumage dépasserait offAt plutôt que de la tronquer', () => {
    // Une seule bascule, placée juste avant offAt (rng position ~0.99), avec une durée qui
    // la fait déborder après offAt.
    const rng = sequenceRng([0.99, 1]); // position puis durée (randomInt avec min=max=60 ignore rng, testons avec range)
    const events = generateDailyPlan({
      onAt,
      offAt,
      toggleWindowMinutes: 240,
      toggleCountMin: 1,
      toggleCountMax: 1,
      toggleDurationMin: 60,
      toggleDurationMax: 60,
      rng,
    });
    // La bascule démarre à ~99% de la fenêtre (4h*0.99 ≈ 3h46) et dure 60 min : elle
    // déborderait après offAt (23:00) -> supprimée, il ne reste que on/off.
    expect(events).toEqual([
      { kind: 'on', action: 'ON', at: onAt },
      { kind: 'off', action: 'OFF', at: offAt },
    ]);
  });

  it('fusionne les bascules qui se chevauchent (pas de deux actions identiques consécutives)', () => {
    // deux bascules très rapprochées, la seconde commence avant que la première ne se termine
    let call = 0;
    const rng = () => {
      const values = [0.1, 20, 0.12, 20]; // position1, durée1(min), position2, durée2(min)
      return values[call++] ?? 0;
    };
    // Simule manuellement des positions via rng directement dans un scénario contrôlé:
    // toggleDurationMin=toggleDurationMax=20 -> durée fixe 20min, seul rng() de position varie.
    const events = generateDailyPlan({
      onAt,
      offAt,
      toggleWindowMinutes: 240,
      toggleCountMin: 2,
      toggleCountMax: 2,
      toggleDurationMin: 20,
      toggleDurationMax: 20,
      rng: sequenceRng([0.1, 0, 0.12, 0]),
    });
    for (let i = 1; i < events.length; i++) {
      expect(events[i].action).not.toBe(events[i - 1].action);
    }
  });

  it('lève une erreur si onAt >= offAt', () => {
    expect(() =>
      generateDailyPlan({
        onAt: offAt,
        offAt: onAt,
        toggleWindowMinutes: 240,
        toggleCountMin: 0,
        toggleCountMax: 0,
        toggleDurationMin: 1,
        toggleDurationMax: 1,
      }),
    ).toThrow();
  });

  it('concentre les bascules dans la fenêtre avant offAt quand toggleWindowMinutes < durée totale', () => {
    // fenêtre totale 4h (240 min), toggleWindowMinutes=60 -> bascules seulement dans les 60
    // dernières minutes avant offAt, soit à partir de 22:00.
    const toggleStart = new Date(offAt.getTime() - 60 * 60_000);
    const events = generateDailyPlan({
      onAt,
      offAt,
      toggleWindowMinutes: 60,
      toggleCountMin: 5,
      toggleCountMax: 5,
      toggleDurationMin: 2,
      toggleDurationMax: 5,
      rng: Math.random,
    });
    const toggleEvents = events.filter((e) => e.kind === 'toggle_on' || e.kind === 'toggle_off');
    expect(toggleEvents.length).toBeGreaterThan(0);
    for (const e of toggleEvents) {
      expect(e.at.getTime()).toBeGreaterThanOrEqual(toggleStart.getTime());
    }
  });

  it("n'ajoute aucune bascule quand toggleWindowMinutes vaut 0 (soirée stable jusqu'à l'extinction)", () => {
    const events = generateDailyPlan({
      onAt,
      offAt,
      toggleWindowMinutes: 0,
      toggleCountMin: 5,
      toggleCountMax: 5,
      toggleDurationMin: 2,
      toggleDurationMax: 5,
      rng: Math.random,
    });
    expect(events).toEqual([
      { kind: 'on', action: 'ON', at: onAt },
      { kind: 'off', action: 'OFF', at: offAt },
    ]);
  });
});
