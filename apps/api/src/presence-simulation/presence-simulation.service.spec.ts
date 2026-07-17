import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PresenceSimulationService } from './presence-simulation.service';
import { MqttService } from '../mqtt/mqtt.service';
import { WeatherService } from '../weather/weather.service';
import { NotificationService } from '../notifications/notification.service';

type FakeProfile = {
  id: string;
  name: string;
  enabled: boolean;
  lightDeviceIds: string;
  onTime: string;
  offTime: string;
  onRandomOffsetMin: number;
  onRandomOffsetMax: number;
  offRandomOffsetMin: number;
  offRandomOffsetMax: number;
  toggleCountMin: number;
  toggleCountMax: number;
  toggleDurationMin: number;
  toggleDurationMax: number;
  createdAt: Date;
  updatedAt: Date;
};

type FakeEvent = {
  id: string;
  runId: string;
  kind: string;
  action: string;
  scheduledAt: Date;
  executedAt: Date | null;
  success: boolean | null;
  error: string | null;
};

type FakeRun = {
  id: string;
  profileId: string;
  date: string;
  plannedOnAt: Date;
  plannedOffAt: Date;
  verifiedAt: Date | null;
  verifiedOk: boolean | null;
  events: FakeEvent[];
};

function makeProfile(overrides: Partial<FakeProfile> = {}): FakeProfile {
  return {
    id: 'profile-1',
    name: 'Salon',
    enabled: true,
    lightDeviceIds: JSON.stringify(['lamp-1']),
    onTime: JSON.stringify({ mode: 'fixed', time: '19:00' }),
    offTime: JSON.stringify({ mode: 'fixed', time: '23:00' }),
    onRandomOffsetMin: 0,
    onRandomOffsetMax: 0,
    offRandomOffsetMin: 0,
    offRandomOffsetMax: 0,
    toggleCountMin: 0,
    toggleCountMax: 0,
    toggleDurationMin: 1,
    toggleDurationMax: 5,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeFakePrisma(profiles: FakeProfile[], devices: { id: string; mqttTopic: string | null }[]) {
  const profilesById = new Map(profiles.map((p) => [p.id, p]));
  const runsById = new Map<string, FakeRun>();
  const devicesById = new Map(devices.map((d) => [d.id, d]));
  let seq = 0;

  return {
    __runsById: runsById,
    presenceSimulation: {
      findMany: vi.fn(async ({ where }: { where?: { enabled?: boolean } } = {}) =>
        [...profilesById.values()].filter((p) => where?.enabled === undefined || p.enabled === where.enabled),
      ),
      findUnique: vi.fn(async ({ where: { id } }: { where: { id: string } }) => profilesById.get(id) ?? null),
      update: vi.fn(async ({ where: { id }, data }: { where: { id: string }; data: Partial<FakeProfile> }) => {
        const p = profilesById.get(id)!;
        Object.assign(p, data);
        return p;
      }),
    },
    presenceSimulationRun: {
      findUnique: vi.fn(async ({ where }: { where: { profileId_date: { profileId: string; date: string } } }) => {
        const { profileId, date } = where.profileId_date;
        return [...runsById.values()].find((r) => r.profileId === profileId && r.date === date) ?? null;
      }),
      findMany: vi.fn(
        async ({ where }: { where?: { verifiedAt?: null; plannedOffAt?: { lt: Date }; profileId?: string; date?: { gte: string; lte: string } } } = {}) => {
          return [...runsById.values()]
            .filter((r) => {
              if (where?.verifiedAt === null && r.verifiedAt !== null) return false;
              if (where?.plannedOffAt && !(r.plannedOffAt.getTime() < where.plannedOffAt.lt.getTime())) return false;
              if (where?.profileId && r.profileId !== where.profileId) return false;
              if (where?.date && !(r.date >= where.date.gte && r.date <= where.date.lte)) return false;
              return true;
            })
            .map((r) => attachProfile(r));
        },
      ),
      create: vi.fn(
        async ({
          data,
        }: {
          data: {
            profileId: string;
            date: string;
            plannedOnAt: Date;
            plannedOffAt: Date;
            events: { create: { kind: string; action: string; scheduledAt: Date }[] };
          };
        }) => {
          const run: FakeRun = {
            id: `run-${++seq}`,
            profileId: data.profileId,
            date: data.date,
            plannedOnAt: data.plannedOnAt,
            plannedOffAt: data.plannedOffAt,
            verifiedAt: null,
            verifiedOk: null,
            events: data.events.create.map((e) => ({
              id: `event-${++seq}`,
              runId: '',
              kind: e.kind,
              action: e.action,
              scheduledAt: e.scheduledAt,
              executedAt: null,
              success: null,
              error: null,
            })),
          };
          run.events.forEach((e) => (e.runId = run.id));
          runsById.set(run.id, run);
          return run;
        },
      ),
      update: vi.fn(async ({ where: { id }, data }: { where: { id: string }; data: Partial<FakeRun> }) => {
        const r = runsById.get(id)!;
        Object.assign(r, data);
        return r;
      }),
    },
    presenceSimulationEvent: {
      findMany: vi.fn(async ({ where }: { where?: { executedAt?: null } } = {}) => {
        const all = [...runsById.values()].flatMap((r) => r.events.map((e) => ({ ...e, run: attachProfile(r) })));
        return all.filter((e) => (where?.executedAt === null ? e.executedAt === null : true));
      }),
      findUnique: vi.fn(async ({ where: { id } }: { where: { id: string } }) => {
        for (const run of runsById.values()) {
          const event = run.events.find((e) => e.id === id);
          if (event) return { ...event, run: attachProfile(run) };
        }
        return null;
      }),
      update: vi.fn(async ({ where: { id }, data }: { where: { id: string }; data: Partial<FakeEvent> }) => {
        for (const run of runsById.values()) {
          const event = run.events.find((e) => e.id === id);
          if (event) {
            Object.assign(event, data);
            return event;
          }
        }
        throw new Error(`event ${id} not found`);
      }),
    },
    device: {
      findMany: vi.fn(async ({ where }: { where?: { id?: { in: string[] } } } = {}) =>
        [...devicesById.values()].filter((d) => !where?.id || where.id.in.includes(d.id)),
      ),
    },
  } as any;

  function attachProfile(run: FakeRun) {
    return { ...run, profile: profilesById.get(run.profileId) };
  }
}

function makeFakeMqtt(connected = true) {
  return { isConnected: connected, publish: vi.fn() } as unknown as MqttService;
}
function makeFakeWeather(sun: { sunrise: Date; sunset: Date; date: string } | null = null) {
  return { getSunTimes: vi.fn(async () => sun) } as unknown as WeatherService;
}
function makeFakeNotifications() {
  return { sendTelegram: vi.fn(async () => ({ ok: true })), sendEmail: vi.fn() } as unknown as NotificationService;
}

describe('PresenceSimulationService', () => {
  let prisma: any;
  let mqtt: MqttService;
  let weather: WeatherService;
  let notifications: NotificationService;
  let service: PresenceSimulationService;

  beforeEach(() => {
    vi.useRealTimers();
  });

  function setup(profiles: FakeProfile[]) {
    prisma = makeFakePrisma(profiles, [{ id: 'lamp-1', mqttTopic: 'zigbee2mqtt/lamp' }]);
    mqtt = makeFakeMqtt();
    weather = makeFakeWeather();
    notifications = makeFakeNotifications();
    service = new PresenceSimulationService(prisma, mqtt, weather, notifications);
  }

  it("génère un plan pour aujourd'hui et demain pour un profil activé (heures fixes)", async () => {
    setup([makeProfile()]);
    await (service as any).tick();
    const runs = [...prisma.__runsById.values()];
    expect(runs.length).toBe(2);
    for (const run of runs) {
      expect(run.events[0].kind).toBe('on');
      expect(run.events[run.events.length - 1].kind).toBe('off');
    }
  });

  it('ne régénère pas un plan déjà existant pour la même date (idempotent)', async () => {
    setup([makeProfile()]);
    await (service as any).tick();
    const countAfterFirst = prisma.__runsById.size;
    await (service as any).tick();
    expect(prisma.__runsById.size).toBe(countAfterFirst);
  });

  it('résout une heure solaire via WeatherService', async () => {
    const sunrise = new Date('2026-07-17T06:30:00');
    const sunset = new Date('2026-07-17T21:45:00');
    setup([
      makeProfile({
        onTime: JSON.stringify({ mode: 'solar', reference: 'sunset', offsetMinutes: -15 }),
        offTime: JSON.stringify({ mode: 'fixed', time: '23:30' }),
      }),
    ]);
    weather = makeFakeWeather({ sunrise, sunset, date: '2026-07-17' });
    service = new PresenceSimulationService(prisma, mqtt, weather, notifications);

    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    const resolved = await (service as any).resolveTime({ mode: 'solar', reference: 'sunset', offsetMinutes: -15 }, `${y}-${m}-${d}`);
    expect(resolved?.getTime()).toBe(sunset.getTime() - 15 * 60_000);
  });

  it('ne crée pas de run si une heure solaire est demandée mais indisponible', async () => {
    setup([
      makeProfile({
        onTime: JSON.stringify({ mode: 'solar', reference: 'sunset', offsetMinutes: 0 }),
      }),
    ]);
    await (service as any).tick();
    expect(prisma.__runsById.size).toBe(0);
  });

  // Génère le plan directement via ensureRun() pour une date dans le futur (au lieu de tick(),
  // qui appellerait aussi catchUpAndArmTimers et marquerait "raté" un événement dont l'heure
  // fixe du jour est déjà passée par rapport à l'horloge réelle du test).
  function futureDate(daysAhead: number): Date {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    return d;
  }

  it("executeEvent publie l'état sur le bon topic MQTT et marque success:true", async () => {
    setup([makeProfile()]);
    const profile = (await prisma.presenceSimulation.findMany())[0];
    await (service as any).ensureRun(profile, futureDate(2));
    const run = [...prisma.__runsById.values()][0];
    const onEvent = run.events[0];

    await service.executeEvent(onEvent.id);

    expect(mqtt.publish).toHaveBeenCalledWith('zigbee2mqtt/lamp/set', JSON.stringify({ state: 'ON' }));
    expect(onEvent.success).toBe(true);
    expect(onEvent.executedAt).not.toBeNull();
  });

  it('executeEvent est un no-op si déjà exécuté (idempotent)', async () => {
    setup([makeProfile()]);
    const profile = (await prisma.presenceSimulation.findMany())[0];
    await (service as any).ensureRun(profile, futureDate(2));
    const run = [...prisma.__runsById.values()][0];
    const onEvent = run.events[0];
    await service.executeEvent(onEvent.id);
    (mqtt.publish as any).mockClear();
    await service.executeEvent(onEvent.id);
    expect(mqtt.publish).not.toHaveBeenCalled();
  });

  it('marque success:false si MQTT est déconnecté', async () => {
    setup([makeProfile()]);
    mqtt = makeFakeMqtt(false);
    service = new PresenceSimulationService(prisma, mqtt, weather, notifications);
    const profile = (await prisma.presenceSimulation.findMany())[0];
    await (service as any).ensureRun(profile, futureDate(2));
    const run = [...prisma.__runsById.values()][0];
    await service.executeEvent(run.events[0].id);
    expect(run.events[0].success).toBe(false);
  });

  it('marque en échec (sans le rejouer) un événement en retard de plus de 2 cycles', async () => {
    setup([makeProfile()]);
    await (service as any).tick();
    const run = [...prisma.__runsById.values()][0];
    run.events[0].scheduledAt = new Date(Date.now() - 10 * 60_000); // 10 min en retard

    await (service as any).catchUpAndArmTimers();

    expect(run.events[0].executedAt).not.toBeNull();
    expect(run.events[0].success).toBe(false);
    expect(mqtt.publish).not.toHaveBeenCalled();
  });

  it('verifyCompletedRuns envoie une notification Telegram unique et marque verifiedOk', async () => {
    setup([makeProfile()]);
    await (service as any).tick();
    const run = [...prisma.__runsById.values()][0];
    run.plannedOffAt = new Date(Date.now() - 1000); // le run est "terminé"
    for (const e of run.events) {
      e.executedAt = new Date();
      e.success = true;
    }

    await service.verifyCompletedRuns();

    expect(run.verifiedAt).not.toBeNull();
    expect(run.verifiedOk).toBe(true);
    expect(notifications.sendTelegram).toHaveBeenCalledTimes(1);

    // Un second passage ne doit pas renvoyer de notification (verifiedAt déjà posé).
    (notifications.sendTelegram as any).mockClear();
    await service.verifyCompletedRuns();
    expect(notifications.sendTelegram).not.toHaveBeenCalled();
  });

  it('verifyCompletedRuns rapporte verifiedOk:false si un événement a échoué', async () => {
    setup([makeProfile()]);
    await (service as any).tick();
    const run = [...prisma.__runsById.values()][0];
    run.plannedOffAt = new Date(Date.now() - 1000);
    for (const e of run.events) {
      e.executedAt = new Date();
      e.success = true;
    }
    run.events[0].success = false;

    await service.verifyCompletedRuns();

    expect(run.verifiedOk).toBe(false);
    expect(notifications.sendTelegram).toHaveBeenCalledTimes(1);
  });
});
