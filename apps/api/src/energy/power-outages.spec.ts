import { describe, expect, it } from 'vitest';
import { AvailabilityDrop, classifyOutages, computePowerRuns, PowerReading } from './power-outages';

const d = (iso: string) => new Date(iso);
const r = (iso: string, powerW: number | null): PowerReading => ({ timestamp: d(iso), powerW });
const drop = (deviceName: string, iso: string): AvailabilityDrop => ({ deviceName, at: d(iso) });
const now = d('2026-10-13T20:00:00');

describe('computePowerRuns', () => {
  it('va du premier 0 W au premier relevé normal suivant (coupure du 13/10)', () => {
    const runs = computePowerRuns([r('2026-10-13T13:10:45', 434), r('2026-10-13T13:11:09', 0), r('2026-10-13T13:30:21', 289)]);
    expect(runs).toEqual([{ start: d('2026-10-13T13:11:09'), end: d('2026-10-13T13:30:21') }]);
  });

  it('compte une seule fois des relevés à 0 W consécutifs et ignore une puissance aberrante', () => {
    const runs = computePowerRuns([
      r('2026-10-13T13:00:00', 0),
      r('2026-10-13T13:05:00', 0),
      r('2026-10-13T13:07:00', 1_054_889), // aberrant : ne met pas fin à la coupure
      r('2026-10-13T13:10:00', 280),
    ]);
    expect(runs).toEqual([{ start: d('2026-10-13T13:00:00'), end: d('2026-10-13T13:10:00') }]);
  });

  it('signale une série en cours et ne renvoie rien sans relevé', () => {
    expect(computePowerRuns([r('2026-10-13T19:45:00', 0)])).toEqual([{ start: d('2026-10-13T19:45:00'), end: null }]);
    expect(computePowerRuns([])).toEqual([]);
  });
});

describe('classifyOutages', () => {
  const tracking = d('2026-10-13T00:00:00');
  const cut = [{ start: d('2026-10-13T13:11:09'), end: d('2026-10-13T13:30:21') }];

  it('confirme une coupure quand des appareils sur secteur passent hors ligne en même temps', () => {
    const { outages, discarded } = classifyOutages(
      cut,
      [drop('Lampe chambre clara', '2026-10-13T13:11:25'), drop('Ventilation ss sol', '2026-10-13T13:12:31'), drop('Lumière balcon', '2026-10-13T13:13:10')],
      tracking,
      now,
    );
    expect(discarded).toBe(0);
    expect(outages).toEqual([
      expect.objectContaining({ status: 'confirmed', durationMinutes: 19.2, ongoing: false, devicesOffline: ['Lampe chambre clara', 'Ventilation ss sol', 'Lumière balcon'] }),
    ]);
  });

  it('écarte un 0 W isolé quand les autres appareils restent actifs (parasite), même long', () => {
    const { outages, discarded } = classifyOutages(cut, [drop('Capteur sans rapport', '2026-10-13T09:00:00')], tracking, now);
    expect(outages).toEqual([]);
    expect(discarded).toBe(1);
  });

  it('confirme une coupure très courte dès que des appareils décrochent', () => {
    const { outages } = classifyOutages(
      [{ start: d('2026-10-13T13:00:00'), end: d('2026-10-13T13:00:40') }],
      [drop('Lampe', '2026-10-13T13:01:00')],
      tracking,
      now,
    );
    expect(outages[0]).toMatchObject({ status: 'confirmed', durationMinutes: 0.7 });
  });

  it('avant le suivi des disponibilités : « non vérifiée » seulement si elle dure au moins 2 min', () => {
    const early = [
      { start: d('2026-09-21T10:38:53'), end: d('2026-09-21T10:42:05') }, // 3,2 min
      { start: d('2026-09-19T16:03:30'), end: d('2026-09-19T16:04:06') }, // 36 s
    ];
    const { outages, discarded } = classifyOutages(early, [], tracking, now);
    expect(outages.map((o) => [o.durationMinutes, o.status])).toEqual([[3.2, 'unverified']]);
    expect(discarded).toBe(1);
  });

  it('sans aucun suivi de disponibilité, toute coupure de plus de 2 min est « non vérifiée »', () => {
    const { outages } = classifyOutages(cut, [], null, now);
    expect(outages[0].status).toBe('unverified');
  });

  it('une coupure qui vient de commencer reste « à confirmer » jusqu\'à ce que des appareils décrochent', () => {
    const justNow = [{ start: d('2026-10-13T19:58:00'), end: null }];
    expect(classifyOutages(justNow, [], tracking, now).outages[0]).toMatchObject({ status: 'pending', ongoing: true, durationMinutes: 2 });
    expect(classifyOutages(justNow, [drop('Lampe', '2026-10-13T19:58:30')], tracking, now).outages[0].status).toBe('confirmed');
  });

  it('une série en cours depuis plus de 6 min sans aucun appareil hors ligne est un parasite', () => {
    const old = [{ start: d('2026-10-13T19:30:00'), end: null }];
    const { outages, discarded } = classifyOutages(old, [], tracking, now);
    expect(outages).toEqual([]);
    expect(discarded).toBe(1);
  });
});
