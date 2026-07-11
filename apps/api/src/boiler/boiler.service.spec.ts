import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BoilerService, BoilerConfig, LevelKey } from './boiler.service';
import { MqttService } from '../mqtt/mqtt.service';
import { SettingsService } from '../settings/settings.service';

type FakeDevice = { id: string; name: string; status: string; mqttTopic: string | null; state: string };

function makeFakePrisma(devices: FakeDevice[]) {
  const byId = new Map(devices.map((d) => [d.id, d]));
  return {
    device: {
      findUnique: vi.fn(async ({ where: { id } }: { where: { id: string } }) => byId.get(id) ?? null),
    },
  } as any;
}

function makeFakeSettings() {
  const store = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
  } as unknown as SettingsService;
}

function makeFakeMqtt() {
  return { publish: vi.fn() } as unknown as MqttService;
}

const RELAY_ID = 'relay-1';
const SENSOR_ID = 'sensor-1';

function baseConfig(overrides: Partial<BoilerConfig> = {}): BoilerConfig {
  return {
    deviceId: RELAY_ID,
    temperatureSensorId: SENSOR_ID,
    hysteresis: 0.5,
    levels: { eco: 17, confort: 19, confort_plus: 21, vacances: 12, nuit: 16 },
    defaultLevel: 'eco',
    programs: [],
    dayPrograms: {},
    dateExceptions: [],
    minOnMinutes: 0,
    minOffMinutes: 0,
    ...overrides,
  };
}

function setSensorTemp(prisma: any, temp: number | null) {
  const sensor = prisma.device.findUnique.mock.results; // no-op, kept for readability
  const device = (prisma as { __devices: Map<string, FakeDevice> }).__devices?.get(SENSOR_ID);
  if (device) device.state = temp === null ? '{}' : JSON.stringify({ temperature: temp });
}

// Force une nouvelle passe de régulation à l'instant courant (fake timers), en repassant par
// setConfig avec la config inchangée : c'est le seul déclencheur public de evaluate() qui ne
// modifie pas l'état de dérogation (contrairement à setBoost/clearBoost).
async function tick(service: BoilerService, config: BoilerConfig) {
  await service.setConfig(config);
}

describe('BoilerService', () => {
  let prisma: any;
  let devicesById: Map<string, FakeDevice>;
  let mqtt: MqttService;
  let settings: SettingsService;
  let service: BoilerService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-15T10:00:00'));

    const relay: FakeDevice = { id: RELAY_ID, name: 'Relais chaudière', status: 'online', mqttTopic: 'zigbee2mqtt/relais', state: '{}' };
    const sensor: FakeDevice = { id: SENSOR_ID, name: 'Sonde salon', status: 'online', mqttTopic: null, state: '{}' };
    devicesById = new Map([[RELAY_ID, relay], [SENSOR_ID, sensor]]);
    prisma = makeFakePrisma([relay, sensor]);
    prisma.__devices = devicesById;
    mqtt = makeFakeMqtt();
    settings = makeFakeSettings();
    service = new BoilerService(prisma, mqtt, settings);
  });

  describe('régulation par hystérésis', () => {
    it('commande ON quand la température est sous la cible - hystérésis', async () => {
      const config = baseConfig({ defaultLevel: 'confort' }); // cible 19°C, hystérésis 0.5
      setSensorTemp(prisma, 18.2); // < 19 - 0.5
      await service.setConfig(config);

      expect(mqtt.publish).toHaveBeenCalledWith('zigbee2mqtt/relais/set', JSON.stringify({ state: 'ON' }));
      expect((await service.getStatus()).commandedState).toBe('ON');
    });

    it('commande OFF quand la température dépasse la cible + hystérésis', async () => {
      const config = baseConfig({ defaultLevel: 'confort' });
      setSensorTemp(prisma, 19.8); // > 19 + 0.5
      await service.setConfig(config);

      expect(mqtt.publish).toHaveBeenCalledWith('zigbee2mqtt/relais/set', JSON.stringify({ state: 'OFF' }));
      expect((await service.getStatus()).commandedState).toBe('OFF');
    });

    it('garde l\'état commandé dans la zone morte (ni ON ni OFF francs)', async () => {
      const config = baseConfig({ defaultLevel: 'confort', minOnMinutes: 0, minOffMinutes: 0 });
      setSensorTemp(prisma, 18.2); // déclenche ON
      await service.setConfig(config);
      expect((await service.getStatus()).commandedState).toBe('ON');

      (mqtt.publish as any).mockClear();
      setSensorTemp(prisma, 19.2); // dans la zone morte [18.5, 19.5]
      await tick(service, config);

      expect(mqtt.publish).not.toHaveBeenCalled();
      expect((await service.getStatus()).commandedState).toBe('ON');
    });
  });

  describe('anti-cycle court', () => {
    it('diffère un changement d\'état tant que la durée minimale n\'est pas écoulée', async () => {
      const config = baseConfig({ defaultLevel: 'confort', minOnMinutes: 10, minOffMinutes: 10 });
      setSensorTemp(prisma, 18.2); // ON
      await service.setConfig(config);
      expect((await service.getStatus()).commandedState).toBe('ON');

      (mqtt.publish as any).mockClear();
      setSensorTemp(prisma, 19.8); // devrait passer OFF, mais on est encore dans les 10 min
      vi.setSystemTime(new Date('2026-07-15T10:05:00')); // +5 min seulement
      await tick(service, config);

      expect(mqtt.publish).not.toHaveBeenCalled();
      expect((await service.getStatus()).commandedState).toBe('ON');
    });

    it('applique le changement une fois la durée minimale écoulée', async () => {
      const config = baseConfig({ defaultLevel: 'confort', minOnMinutes: 10, minOffMinutes: 10 });
      setSensorTemp(prisma, 18.2); // ON
      await service.setConfig(config);

      setSensorTemp(prisma, 19.8);
      vi.setSystemTime(new Date('2026-07-15T10:11:00')); // +11 min : anti-cycle respecté
      await tick(service, config);

      expect(mqtt.publish).toHaveBeenLastCalledWith('zigbee2mqtt/relais/set', JSON.stringify({ state: 'OFF' }));
      expect((await service.getStatus()).commandedState).toBe('OFF');
    });
  });

  describe('sonde de température indisponible', () => {
    it('met la régulation en pause sans envoyer de commande', async () => {
      const config = baseConfig({ defaultLevel: 'confort' });
      setSensorTemp(prisma, null); // sonde ne renvoie pas de valeur numérique exploitable
      await service.setConfig(config);

      expect(mqtt.publish).not.toHaveBeenCalled();
      const status = await service.getStatus();
      expect(status.commandedState).toBeNull();
      expect(status.currentTemp).toBeNull();
    });

    it('ne modifie pas un état déjà commandé si la sonde disparaît ensuite', async () => {
      const config = baseConfig({ defaultLevel: 'confort' });
      setSensorTemp(prisma, 18.2);
      await service.setConfig(config); // ON commandé
      expect((await service.getStatus()).commandedState).toBe('ON');

      (mqtt.publish as any).mockClear();
      setSensorTemp(prisma, null);
      await tick(service, config);

      expect(mqtt.publish).not.toHaveBeenCalled();
      expect((await service.getStatus()).commandedState).toBe('ON');
    });
  });

  describe('créneaux traversant minuit', () => {
    const nightProgram = {
      id: 'p1',
      name: 'Semaine',
      slots: [{ from: '22:00', to: '06:00', level: 'nuit' as LevelKey }],
    };

    it('applique le niveau "nuit" après minuit (ex: 05:30)', async () => {
      vi.setSystemTime(new Date('2026-07-15T05:30:00')); // mercredi
      const config = baseConfig({
        programs: [nightProgram],
        dayPrograms: { 2: 'p1' }, // mercredi = index 2 (0=lundi)
      });
      setSensorTemp(prisma, 15); // sous la cible "nuit" (16°C) pour objectiver le niveau actif
      await service.setConfig(config);

      expect((await service.getStatus()).activeLevel).toBe('nuit');
    });

    it('applique le niveau "nuit" avant minuit (ex: 23:30)', async () => {
      vi.setSystemTime(new Date('2026-07-15T23:30:00'));
      const config = baseConfig({
        programs: [nightProgram],
        dayPrograms: { 2: 'p1' },
      });
      setSensorTemp(prisma, 15);
      await service.setConfig(config);

      expect((await service.getStatus()).activeLevel).toBe('nuit');
    });

    it('retombe sur le niveau par défaut hors du créneau nocturne', async () => {
      vi.setSystemTime(new Date('2026-07-15T12:00:00'));
      const config = baseConfig({
        defaultLevel: 'eco',
        programs: [nightProgram],
        dayPrograms: { 2: 'p1' },
      });
      setSensorTemp(prisma, 15);
      await service.setConfig(config);

      expect((await service.getStatus()).activeLevel).toBe('eco');
    });
  });

  describe('boost temporaire (override)', () => {
    it('applique le niveau de boost tant qu\'il est actif', async () => {
      const config = baseConfig({ defaultLevel: 'eco' });
      await service.setConfig(config);
      setSensorTemp(prisma, 15);

      await service.setBoost('confort_plus', 30);
      expect((await service.getStatus()).activeLevel).toBe('confort_plus');
    });

    it('revient au planning une fois le boost expiré', async () => {
      const config = baseConfig({ defaultLevel: 'eco' });
      await service.setConfig(config);
      setSensorTemp(prisma, 15);

      await service.setBoost('confort_plus', 30);
      vi.setSystemTime(new Date(Date.now() + 31 * 60_000));
      await tick(service, config);

      expect((await service.getStatus()).activeLevel).toBe('eco');
    });
  });

  describe('arrêt d\'urgence', () => {
    it('coupe immédiatement le relais et bloque la régulation tant que enabled=false', async () => {
      const config = baseConfig({ defaultLevel: 'confort' });
      setSensorTemp(prisma, 18.2);
      await service.setConfig(config); // ON

      await service.setEnabled(false);
      expect(mqtt.publish).toHaveBeenLastCalledWith('zigbee2mqtt/relais/set', JSON.stringify({ state: 'OFF' }));

      (mqtt.publish as any).mockClear();
      setSensorTemp(prisma, 15); // devrait vouloir repasser ON si la régulation tournait
      await tick(service, config);
      expect(mqtt.publish).not.toHaveBeenCalled();
    });
  });
});
