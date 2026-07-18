import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { NetatmoService } from './netatmo.service';
import { SettingsService } from '../settings/settings.service';

type FakeDevice = {
  id: string;
  name: string;
  protocol: string;
  type: string;
  state: string;
  status: string;
  mqttTopic: string | null;
  trackHistory: boolean;
  historyFieldConfig: string;
  lastSeen: Date;
};

function makeFakeSettings() {
  const store = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    __store: store,
  } as unknown as SettingsService & { __store: Map<string, string> };
}

function makeFakePrisma() {
  const devicesById = new Map<string, FakeDevice>();
  const events: { deviceId: string; event: string; data: string }[] = [];
  let seq = 0;

  return {
    __devicesById: devicesById,
    __events: events,
    device: {
      findUnique: vi.fn(async ({ where: { id } }: { where: { id: string } }) => {
        const device = devicesById.get(id);
        return device ? { ...device } : null; // copie : évite qu'une mutation ultérieure (updateMany) ne modifie rétroactivement ce snapshot
      }),
      create: vi.fn(async ({ data }: { data: Partial<FakeDevice> }) => {
        const device: FakeDevice = {
          id: `device-${++seq}`,
          name: data.name ?? 'Netatmo',
          protocol: data.protocol ?? 'netatmo',
          type: data.type ?? 'sensor',
          state: data.state ?? '{}',
          status: 'offline',
          mqttTopic: null,
          trackHistory: data.trackHistory ?? true,
          historyFieldConfig: '[]',
          lastSeen: new Date(),
        };
        devicesById.set(device.id, device);
        return device;
      }),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string; state?: string; status?: { not: string } };
          data: Partial<FakeDevice>;
        }) => {
          const device = devicesById.get(where.id);
          if (!device) return { count: 0 };
          if (where.state !== undefined && device.state !== where.state) return { count: 0 };
          if (where.status !== undefined && device.status === where.status.not) return { count: 0 };
          Object.assign(device, data);
          return { count: 1 };
        },
      ),
    },
    deviceEvent: {
      create: vi.fn(async ({ data }: { data: { deviceId: string; event: string; data: string } }) => {
        events.push(data);
        return { id: `event-${++seq}`, ...data, timestamp: new Date() };
      }),
    },
  } as any;
}

function tokenResponse(overrides: Partial<{ access_token: string; refresh_token: string; expires_in: number }> = {}) {
  return {
    access_token: 'access-1',
    refresh_token: 'refresh-1',
    expires_in: 10800,
    ...overrides,
  };
}

function homesDataResponse() {
  return {
    body: {
      homes: [
        {
          id: 'home-1',
          rooms: [{ id: 'room-1', name: 'Salon' }],
          modules: [{ id: 'module-1', type: 'NATherm1', room_id: 'room-1' }],
        },
      ],
    },
  };
}

function homeStatusResponse(temperature: number, reachable = true) {
  return {
    body: {
      home: {
        id: 'home-1',
        rooms: [{ id: 'room-1', reachable, therm_measured_temperature: temperature, therm_setpoint_temperature: 19 }],
      },
    },
  };
}

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body, text: async () => JSON.stringify(body) } as Response;
}

describe('NetatmoService', () => {
  let prisma: any;
  let settings: SettingsService;
  let service: NetatmoService;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    prisma = makeFakePrisma();
    settings = makeFakeSettings();
    service = new NetatmoService(prisma, settings);
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function connectOnce(initialTemp = 20) {
    await service.saveCredentials('client-1', 'secret-1');
    fetchMock.mockImplementation(async (url: string) => {
      const href = String(url);
      if (href.includes('/oauth2/token')) return jsonResponse(tokenResponse());
      if (href.includes('/homesdata')) return jsonResponse(homesDataResponse());
      if (href.includes('/homestatus')) return jsonResponse(homeStatusResponse(initialTemp));
      throw new Error(`unexpected fetch: ${href}`);
    });
    return service.connect('auth-code-1');
  }

  it('connect() crée le Device une seule fois même si rappelé', async () => {
    await connectOnce();
    expect(prisma.device.create).toHaveBeenCalledTimes(1);

    // Un second appel à connect() (ex: l'utilisateur re-colle un code) doit réutiliser le
    // même Device plutôt que d'en créer un doublon.
    fetchMock.mockImplementation(async (url: string) => {
      const href = String(url);
      if (href.includes('/oauth2/token')) return jsonResponse(tokenResponse());
      if (href.includes('/homesdata')) return jsonResponse(homesDataResponse());
      if (href.includes('/homestatus')) return jsonResponse(homeStatusResponse(21));
      throw new Error(`unexpected fetch: ${href}`);
    });
    await service.connect('auth-code-2');
    expect(prisma.device.create).toHaveBeenCalledTimes(1);
  });

  it('poll() met à jour le Device et écrit un DeviceEvent uniquement en cas de changement significatif', async () => {
    await connectOnce(20);
    expect(prisma.__events).toHaveLength(1); // état initial '{}' -> {temperature:20,...} : changement significatif

    fetchMock.mockImplementation(async (url: string) => {
      const href = String(url);
      if (href.includes('/homestatus')) return jsonResponse(homeStatusResponse(20)); // même température
      throw new Error(`unexpected fetch: ${href}`);
    });
    await service.syncNow();
    expect(prisma.__events).toHaveLength(1); // pas de nouvel événement, rien n'a changé

    fetchMock.mockImplementation(async (url: string) => {
      const href = String(url);
      if (href.includes('/homestatus')) return jsonResponse(homeStatusResponse(22.5));
      throw new Error(`unexpected fetch: ${href}`);
    });
    await service.syncNow();
    expect(prisma.__events).toHaveLength(2); // température différente -> nouvel événement

    const status = await service.getStatus();
    expect(status.temperature).toBe(22.5);
  });

  it('rafraîchit le token quand il est expiré et persiste le nouveau refresh_token', async () => {
    await connectOnce(20);

    // Force l'expiration du token courant.
    const raw = JSON.parse((settings as any).__store.get('netatmo.config'));
    raw.accessTokenExpiresAt = new Date(Date.now() - 1000).toISOString();
    (settings as any).__store.set('netatmo.config', JSON.stringify(raw));

    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const href = String(url);
      if (href.includes('/oauth2/token')) {
        expect(String(init?.body)).toContain('grant_type=refresh_token');
        return jsonResponse(tokenResponse({ access_token: 'access-2', refresh_token: 'refresh-2' }));
      }
      if (href.includes('/homestatus')) return jsonResponse(homeStatusResponse(19));
      throw new Error(`unexpected fetch: ${href}`);
    });
    await service.syncNow();

    const persisted = JSON.parse((settings as any).__store.get('netatmo.config'));
    expect(persisted.refreshToken).toBe('refresh-2');
    expect(persisted.accessToken).toBe('access-2');
  });

  it('capture une erreur réseau dans lastError sans jeter', async () => {
    await connectOnce(20);

    fetchMock.mockImplementation(async () => {
      throw new Error('network down');
    });

    await expect(service.syncNow()).resolves.toBeDefined();
    const status = await service.getStatus();
    expect(status.lastError).toBeTruthy();
  });

  it("marque l'appareil hors-ligne quand le relais devient injoignable (pièce absente de homestatus)", async () => {
    await connectOnce(20);
    const deviceId = (await service.getStatus()).deviceId!;
    expect(prisma.__devicesById.get(deviceId).status).toBe('online');

    // Relais coupé : Netatmo ne peut plus renvoyer l'état de la pièce dans homestatus.
    fetchMock.mockImplementation(async (url: string) => {
      const href = String(url);
      if (href.includes('/homestatus')) return jsonResponse({ body: { home: { id: 'home-1', rooms: [] } } });
      throw new Error(`unexpected fetch: ${href}`);
    });
    await service.syncNow();

    expect(prisma.__devicesById.get(deviceId).status).toBe('offline');
    const status = await service.getStatus();
    expect(status.lastError).toContain('introuvable');
  });
});
