import { describe, expect, it, vi } from 'vitest';
import { DisplayService } from './display.service';
import { BoilerService } from '../boiler/boiler.service';
import { SettingsService } from '../settings/settings.service';

let refreshSetting: string | null = null;

// Le client Prisma n'est pas nécessaire : les accès base sont simulés ci-dessous.
vi.mock('@skbox/db', () => ({ PrismaClient: class {} }));

const devices = [
  { id: 'd1', name: 'Salon', room: 'Salon', state: '{"temperature":20.4,"humidity":51,"battery":87}', status: 'online', lastSeen: new Date(), visible: true, active: true },
  { id: 'd2', name: 'Chambre', room: 'Chambre', state: '{"temperature":18.1}', status: 'offline', lastSeen: new Date(), visible: true, active: true },
  { id: 'd3', name: 'Relais chaudière', room: 'Cave', state: '{"state":"ON"}', status: 'online', lastSeen: new Date(), visible: true, active: true },
  { id: 'd4', name: 'Garage', room: null, state: 'pas du json', status: 'online', lastSeen: new Date(), visible: true, active: true },
  { id: 's1', name: 'Lampe', room: 'Chambre', state: '{"state":"ON"}', status: 'online', lastSeen: new Date(), visible: true, active: true },
  { id: 's2', name: 'Prise RF', room: null, state: '{"command":"Off"}', status: 'offline', lastSeen: new Date(), visible: true, active: true },
];

function makeService() {
  const prisma = {
    device: {
      findMany: vi.fn(async ({ where }: any) =>
        where.id ? devices.filter((d) => where.id.in.includes(d.id)) : devices,
      ),
    },
    room: { findMany: vi.fn(async () => [{ name: 'Chambre' }, { name: 'Salon' }]) },
  } as any;
  const boiler = {
    getStatus: vi.fn(async () => ({
      deviceId: 'd3',
      deviceName: 'Relais chaudière',
      deviceOnline: true,
      commandedState: 'ON',
      desiredState: 'ON',
      activeLevel: 'confort_plus',
      targetTemp: 21,
      currentTemp: 20.4,
      scheduleActive: false,
      override: { level: 'confort_plus', until: new Date(Date.now() + 3_600_000).toISOString() },
      lastChangeAt: null,
      enabled: true,
      activeDateException: null,
      mode: 'override',
      programName: 'Semaine',
      nextChange: { at: new Date(Date.now() + 3_600_000).toISOString(), level: 'eco' },
    })),
    getConfig: vi.fn(async () => ({
      levels: { eco: 17, confort: 19, confort_plus: 21, vacances: 12, nuit: 16 },
    })),
  } as unknown as BoilerService;
  const settings = { get: vi.fn(async () => refreshSetting) } as unknown as SettingsService;
  return new DisplayService(prisma, boiler, settings);
}

describe('DisplayService', () => {
  it('ne garde que les capteurs de température, triés par ordre des pièces', async () => {
    const summary = await makeService().getSummary();
    expect(summary.temperatures.map((t) => t.id)).toEqual(['d2', 'd1']);
    expect(summary.temperatures[1]).toMatchObject({ temp: 20.4, humidity: 51, battery: 87, online: true });
    expect(summary.temperatures[0]).toMatchObject({ humidity: null, battery: null, online: false });
  });

  it("respecte l'ordre d'une liste explicite de capteurs", async () => {
    const summary = await makeService().getSummary(['d1', 'd2']);
    expect(summary.temperatures.map((t) => t.id)).toEqual(['d1', 'd2']);
  });

  it('expose les prises et lumières demandées, dans l\'ordre, sans en ajouter', async () => {
    const summary = await makeService().getSummary(undefined, ['s2', 's1']);
    expect(summary.switches).toEqual([
      { id: 's2', name: 'Prise RF', room: null, on: false, online: false },
      { id: 's1', name: 'Lampe', room: 'Chambre', on: true, online: true },
    ]);
    expect((await makeService().getSummary()).switches).toEqual([]);
  });

  it('transmet l\'intervalle de rafraîchissement imposé, ou null', async () => {
    refreshSetting = null;
    expect((await makeService().getSummary()).refreshSeconds).toBeNull();
    refreshSetting = '1800';
    expect((await makeService().getSummary()).refreshSeconds).toBe(1800);
    refreshSetting = '5'; // trop court : ignoré
    expect((await makeService().getSummary()).refreshSeconds).toBeNull();
    refreshSetting = null;
  });

  it("expose l'état de la chaudière et les niveaux avec libellés", async () => {
    const summary = await makeService().getSummary();
    expect(summary.boiler).toMatchObject({
      configured: true,
      heating: true,
      activeLabel: 'Confort+',
      targetTemp: 21,
      override: { level: 'confort_plus', label: 'Confort+' },
    });
    expect(summary.boiler.override!.until).toMatch(/^\d{2}:\d{2}$/);
    expect(summary.boiler).toMatchObject({ mode: 'override', programName: 'Semaine' });
    expect(summary.boiler.next).toMatchObject({ level: 'eco', label: 'Éco', time: summary.boiler.override!.until });
    expect(summary.levels).toHaveLength(5);
    expect(summary.levels.find((l) => l.key === 'eco')).toEqual({ key: 'eco', label: 'Éco', temp: 17 });
  });
});
