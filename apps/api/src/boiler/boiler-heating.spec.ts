import { describe, expect, it } from 'vitest';
import { computeDailyHeating, RelayTransition } from './boiler-heating';

const at = (iso: string) => new Date(iso);
const ev = (iso: string, state: 'ON' | 'OFF'): RelayTransition => ({ timestamp: at(iso), state });

describe('computeDailyHeating', () => {
  const now = at('2026-09-29T12:00:00');

  it('additionne les périodes ON d\'une même journée et compte les cycles', () => {
    const result = computeDailyHeating(
      [
        ev('2026-09-29T06:00:00', 'ON'),
        ev('2026-09-29T07:30:00', 'OFF'),
        ev('2026-09-29T10:00:00', 'ON'),
        ev('2026-09-29T10:20:00', 'OFF'),
      ],
      'OFF',
      3,
      now,
    );
    expect(result.map((d) => d.date)).toEqual(['2026-09-27', '2026-09-28', '2026-09-29']);
    expect(result[2]).toEqual({ date: '2026-09-29', minutes: 110, cycles: 2 });
    expect(result[0].minutes).toBe(0);
  });

  it('répartit une période à cheval sur minuit entre les deux jours', () => {
    const result = computeDailyHeating(
      [ev('2026-09-28T23:00:00', 'ON'), ev('2026-09-29T01:30:00', 'OFF')],
      'OFF',
      2,
      now,
    );
    expect(result[0]).toEqual({ date: '2026-09-28', minutes: 60, cycles: 1 });
    expect(result[1]).toEqual({ date: '2026-09-29', minutes: 90, cycles: 0 });
  });

  it('reprend un état ON antérieur à la fenêtre', () => {
    const result = computeDailyHeating([ev('2026-09-28T02:00:00', 'OFF')], 'ON', 2, now);
    expect(result[0].minutes).toBe(120);
    expect(result[0].cycles).toBe(0);
  });

  it('compte une période encore en cours jusqu\'à maintenant', () => {
    const result = computeDailyHeating([ev('2026-09-29T11:00:00', 'ON')], 'OFF', 1, now);
    expect(result[0]).toEqual({ date: '2026-09-29', minutes: 60, cycles: 1 });
  });

  it('ignore les ON/OFF redondants', () => {
    const result = computeDailyHeating(
      [ev('2026-09-29T08:00:00', 'ON'), ev('2026-09-29T08:30:00', 'ON'), ev('2026-09-29T09:00:00', 'OFF'), ev('2026-09-29T09:10:00', 'OFF')],
      'OFF',
      1,
      now,
    );
    expect(result[0]).toEqual({ date: '2026-09-29', minutes: 60, cycles: 1 });
  });

  it('renvoie zéro partout sans événement ni état initial', () => {
    expect(computeDailyHeating([], null, 2, now).every((d) => d.minutes === 0 && d.cycles === 0)).toBe(true);
  });
});
