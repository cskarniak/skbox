import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScenariosService } from './scenarios.service';
import { MqttService } from '../mqtt/mqtt.service';
import { NotificationService } from '../notifications/notification.service';
import { TriggerContextService } from './trigger-context.service';
import { WeatherService } from '../weather/weather.service';

type FakeDevice = { id: string; name: string; mqttTopic: string | null; state: string };
type FakeScenario = {
  id: string;
  name: string;
  enabled: boolean;
  category: string;
  severity: string | null;
  group: string | null;
  trigger: string;
  conditions: string;
  conditionsOperator: string;
  actions: string;
  lastRun: Date | null;
  runCount: number;
  createdAt: Date;
  updatedAt: Date;
};
type FakeAlarmEvent = {
  id: string;
  scenarioId: string;
  triggeredAt: Date;
  acknowledgedAt: Date | null;
  resolvedAt: Date | null;
  triggerValue: string;
};

function makeFakePrisma(devices: FakeDevice[], scenarios: FakeScenario[]) {
  const devicesById = new Map(devices.map((d) => [d.id, d]));
  const scenariosById = new Map(scenarios.map((s) => [s.id, s]));
  const alarmEvents: FakeAlarmEvent[] = [];
  let seq = 0;

  return {
    __alarmEvents: alarmEvents,
    device: {
      findUnique: vi.fn(async ({ where: { id } }: { where: { id: string } }) => devicesById.get(id) ?? null),
      findFirst: vi.fn(async ({ where }: { where: { mqttTopic: string } }) =>
        [...devicesById.values()].find((d) => d.mqttTopic === where.mqttTopic) ?? null,
      ),
      findMany: vi.fn(async ({ where }: { where?: { id?: { in: string[] } } }) =>
        [...devicesById.values()].filter((d) => !where?.id || where.id.in.includes(d.id)),
      ),
    },
    scenario: {
      findMany: vi.fn(async ({ where }: { where?: { enabled?: boolean } }) =>
        [...scenariosById.values()].filter((s) => where?.enabled === undefined || s.enabled === where.enabled),
      ),
      findUnique: vi.fn(async ({ where: { id } }: { where: { id: string } }) => scenariosById.get(id) ?? null),
      findUniqueOrThrow: vi.fn(async ({ where: { id } }: { where: { id: string } }) => {
        const s = scenariosById.get(id);
        if (!s) throw new Error(`Scenario ${id} not found`);
        return s;
      }),
      update: vi.fn(async ({ where: { id }, data }: { where: { id: string }; data: any }) => {
        const s = scenariosById.get(id)!;
        if (data.runCount?.increment) s.runCount += data.runCount.increment;
        if (data.lastRun) s.lastRun = data.lastRun;
        if (data.enabled !== undefined) s.enabled = data.enabled;
        return s;
      }),
    },
    alarmEvent: {
      findFirst: vi.fn(async ({ where }: { where: { scenarioId: string; resolvedAt: null } }) =>
        alarmEvents.find((e) => e.scenarioId === where.scenarioId && e.resolvedAt === null) ?? null,
      ),
      create: vi.fn(async ({ data }: { data: { scenarioId: string; triggerValue: string } }) => {
        const event: FakeAlarmEvent = {
          id: `ae-${++seq}`,
          scenarioId: data.scenarioId,
          triggeredAt: new Date(),
          acknowledgedAt: null,
          resolvedAt: null,
          triggerValue: data.triggerValue,
        };
        alarmEvents.push(event);
        return event;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: { scenarioId: string; resolvedAt: null }; data: { resolvedAt: Date } }) => {
        let count = 0;
        for (const e of alarmEvents) {
          if (e.scenarioId === where.scenarioId && e.resolvedAt === null) {
            e.resolvedAt = data.resolvedAt;
            count++;
          }
        }
        return { count };
      }),
    },
  } as any;
}

function makeScenario(overrides: Partial<FakeScenario> & Pick<FakeScenario, 'trigger' | 'conditions' | 'actions'>): FakeScenario {
  return {
    id: 'scenario-1',
    name: 'Scénario test',
    enabled: true,
    category: 'automation',
    severity: null,
    group: null,
    conditionsOperator: 'AND',
    lastRun: null,
    runCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeFakeMqtt() {
  return { publish: vi.fn(), subscribe: vi.fn() } as unknown as MqttService;
}
function makeFakeNotifications() {
  return { sendTelegram: vi.fn(), sendEmail: vi.fn() } as unknown as NotificationService;
}
function makeFakeTriggerContext() {
  return { record: vi.fn() } as unknown as TriggerContextService;
}
function makeFakeWeather() {
  return { getSunTimes: vi.fn(async () => null) } as unknown as WeatherService;
}

const MOTION_ID = 'motion-1';
const LAMP_ID = 'lamp-1';
const TEMP_A_ID = 'temp-a';
const TEMP_B_ID = 'temp-b';

describe('ScenariosService — moteur d\'évaluation', () => {
  let devices: FakeDevice[];
  let prisma: any;
  let mqtt: MqttService;
  let notifications: NotificationService;
  let triggerContext: TriggerContextService;
  let weather: WeatherService;
  let service: ScenariosService;

  function setup(scenarios: FakeScenario[]) {
    devices = [
      { id: MOTION_ID, name: 'Détecteur', mqttTopic: 'zigbee2mqtt/detecteur', state: JSON.stringify({ occupancy: false }) },
      { id: LAMP_ID, name: 'Lampe', mqttTopic: 'zigbee2mqtt/lampe', state: '{}' },
      { id: TEMP_A_ID, name: 'Sonde A', mqttTopic: null, state: JSON.stringify({ temperature: 20 }) },
      { id: TEMP_B_ID, name: 'Sonde B', mqttTopic: null, state: JSON.stringify({ temperature: 18 }) },
    ];
    prisma = makeFakePrisma(devices, scenarios);
    mqtt = makeFakeMqtt();
    notifications = makeFakeNotifications();
    triggerContext = makeFakeTriggerContext();
    weather = makeFakeWeather();
    service = new ScenariosService(prisma, mqtt, triggerContext, notifications, weather);
    return service.reloadScenarios();
  }

  function setDeviceState(id: string, state: Record<string, unknown>) {
    const device = devices.find((d) => d.id === id)!;
    device.state = JSON.stringify(state);
  }

  async function fireFromDevice(deviceId: string) {
    await (service as any).evaluateScenariosFor(deviceId);
  }

  describe('combinaison AND / OR des conditions', () => {
    it('AND : déclenche seulement quand toutes les conditions sont vraies', async () => {
      const scenario = makeScenario({
        trigger: JSON.stringify({ type: 'device_state', deviceId: MOTION_ID, property: 'occupancy', operator: 'eq', value: true }),
        conditions: JSON.stringify([
          { type: 'device_state', deviceId: TEMP_A_ID, property: 'temperature', operator: 'gt', value: 15 },
          { type: 'device_state', deviceId: TEMP_B_ID, property: 'temperature', operator: 'lt', value: 10 }, // faux : 18 n'est pas < 10
        ]),
        conditionsOperator: 'AND',
        actions: JSON.stringify([{ type: 'device_command', deviceId: LAMP_ID, command: { state: 'ON' } }]),
      });
      await setup([scenario]);
      setDeviceState(MOTION_ID, { occupancy: true });

      await fireFromDevice(MOTION_ID);

      expect(mqtt.publish).not.toHaveBeenCalled();
    });

    it('AND : déclenche quand toutes les conditions sont vraies', async () => {
      const scenario = makeScenario({
        trigger: JSON.stringify({ type: 'device_state', deviceId: MOTION_ID, property: 'occupancy', operator: 'eq', value: true }),
        conditions: JSON.stringify([
          { type: 'device_state', deviceId: TEMP_A_ID, property: 'temperature', operator: 'gt', value: 15 },
          { type: 'device_state', deviceId: TEMP_B_ID, property: 'temperature', operator: 'lt', value: 25 },
        ]),
        conditionsOperator: 'AND',
        actions: JSON.stringify([{ type: 'device_command', deviceId: LAMP_ID, command: { state: 'ON' } }]),
      });
      await setup([scenario]);
      setDeviceState(MOTION_ID, { occupancy: true });

      await fireFromDevice(MOTION_ID);

      expect(mqtt.publish).toHaveBeenCalledWith('zigbee2mqtt/lampe/set', JSON.stringify({ state: 'ON' }));
    });

    it('OR : déclenche dès qu\'une seule condition est vraie', async () => {
      const scenario = makeScenario({
        trigger: JSON.stringify({ type: 'device_state', deviceId: MOTION_ID, property: 'occupancy', operator: 'eq', value: true }),
        conditions: JSON.stringify([
          { type: 'device_state', deviceId: TEMP_A_ID, property: 'temperature', operator: 'gt', value: 100 }, // faux
          { type: 'device_state', deviceId: TEMP_B_ID, property: 'temperature', operator: 'lt', value: 25 }, // vrai
        ]),
        conditionsOperator: 'OR',
        actions: JSON.stringify([{ type: 'device_command', deviceId: LAMP_ID, command: { state: 'ON' } }]),
      });
      await setup([scenario]);
      setDeviceState(MOTION_ID, { occupancy: true });

      await fireFromDevice(MOTION_ID);

      expect(mqtt.publish).toHaveBeenCalledWith('zigbee2mqtt/lampe/set', JSON.stringify({ state: 'ON' }));
    });
  });

  describe('condition plage horaire traversant minuit', () => {
    beforeEach(() => vi.useFakeTimers());

    it('est vraie après minuit et avant la borne de fin (ex: 23:00-06:00 à 02:00)', async () => {
      vi.setSystemTime(new Date('2026-07-15T02:00:00'));
      const scenario = makeScenario({
        trigger: JSON.stringify({ type: 'device_state', deviceId: MOTION_ID, property: 'occupancy', operator: 'eq', value: true }),
        conditions: JSON.stringify([{ type: 'time_range', from: '23:00', to: '06:00' }]),
        actions: JSON.stringify([{ type: 'device_command', deviceId: LAMP_ID, command: { state: 'ON' } }]),
      });
      await setup([scenario]);
      setDeviceState(MOTION_ID, { occupancy: true });

      await fireFromDevice(MOTION_ID);

      expect(mqtt.publish).toHaveBeenCalledWith('zigbee2mqtt/lampe/set', JSON.stringify({ state: 'ON' }));
    });

    it('est fausse en dehors de la plage (ex: 23:00-06:00 à 12:00)', async () => {
      vi.setSystemTime(new Date('2026-07-15T12:00:00'));
      const scenario = makeScenario({
        trigger: JSON.stringify({ type: 'device_state', deviceId: MOTION_ID, property: 'occupancy', operator: 'eq', value: true }),
        conditions: JSON.stringify([{ type: 'time_range', from: '23:00', to: '06:00' }]),
        actions: JSON.stringify([{ type: 'device_command', deviceId: LAMP_ID, command: { state: 'ON' } }]),
      });
      await setup([scenario]);
      setDeviceState(MOTION_ID, { occupancy: true });

      await fireFromDevice(MOTION_ID);

      expect(mqtt.publish).not.toHaveBeenCalled();
    });
  });

  describe('condition d\'écart entre deux appareils (device_diff)', () => {
    it('compare l\'écart de température au seuil configuré', async () => {
      // Sonde A = 20°C, Sonde B = 18°C -> écart de 2°C
      const scenario = makeScenario({
        trigger: JSON.stringify({ type: 'device_state', deviceId: MOTION_ID, property: 'occupancy', operator: 'eq', value: true }),
        conditions: JSON.stringify([
          { type: 'device_diff', deviceIdA: TEMP_A_ID, propertyA: 'temperature', deviceIdB: TEMP_B_ID, propertyB: 'temperature', operator: 'gt', threshold: 1 },
        ]),
        actions: JSON.stringify([{ type: 'device_command', deviceId: LAMP_ID, command: { state: 'ON' } }]),
      });
      await setup([scenario]);
      setDeviceState(MOTION_ID, { occupancy: true });

      await fireFromDevice(MOTION_ID);
      expect(mqtt.publish).toHaveBeenCalledTimes(1);
    });

    it('ne déclenche pas si l\'écart est sous le seuil', async () => {
      const scenario = makeScenario({
        trigger: JSON.stringify({ type: 'device_state', deviceId: MOTION_ID, property: 'occupancy', operator: 'eq', value: true }),
        conditions: JSON.stringify([
          { type: 'device_diff', deviceIdA: TEMP_A_ID, propertyA: 'temperature', deviceIdB: TEMP_B_ID, propertyB: 'temperature', operator: 'gt', threshold: 5 },
        ]),
        actions: JSON.stringify([{ type: 'device_command', deviceId: LAMP_ID, command: { state: 'ON' } }]),
      });
      await setup([scenario]);
      setDeviceState(MOTION_ID, { occupancy: true });

      await fireFromDevice(MOTION_ID);
      expect(mqtt.publish).not.toHaveBeenCalled();
    });
  });

  describe('scénarios d\'alarme : déclenchement, non-duplication, résolution', () => {
    function alarmScenario() {
      return makeScenario({
        category: 'alarm',
        severity: 'critical',
        trigger: JSON.stringify({ type: 'device_state', deviceId: MOTION_ID, property: 'occupancy', operator: 'eq', value: true }),
        conditions: '[]',
        actions: JSON.stringify([{ type: 'notify_telegram', message: 'Intrusion détectée' }]),
      });
    }

    it('crée un AlarmEvent au premier déclenchement', async () => {
      await setup([alarmScenario()]);
      setDeviceState(MOTION_ID, { occupancy: true });

      await fireFromDevice(MOTION_ID);

      expect(prisma.__alarmEvents).toHaveLength(1);
      expect(prisma.__alarmEvents[0].resolvedAt).toBeNull();
      expect(notifications.sendTelegram).toHaveBeenCalledTimes(1);
    });

    it('ne crée pas de second AlarmEvent tant que le premier est ouvert', async () => {
      await setup([alarmScenario()]);
      setDeviceState(MOTION_ID, { occupancy: true });

      await fireFromDevice(MOTION_ID); // 1er déclenchement
      await fireFromDevice(MOTION_ID); // message répété, capteur toujours à true

      expect(prisma.__alarmEvents).toHaveLength(1);
      expect(notifications.sendTelegram).toHaveBeenCalledTimes(1);
    });

    it('résout silencieusement l\'alarme ouverte quand le capteur revient à la normale', async () => {
      await setup([alarmScenario()]);
      setDeviceState(MOTION_ID, { occupancy: true });
      await fireFromDevice(MOTION_ID);
      expect(prisma.__alarmEvents[0].resolvedAt).toBeNull();

      setDeviceState(MOTION_ID, { occupancy: false });
      await fireFromDevice(MOTION_ID);

      expect(prisma.__alarmEvents[0].resolvedAt).not.toBeNull();
      // La résolution ne doit pas ré-exécuter les actions (pas de 2e notification).
      expect(notifications.sendTelegram).toHaveBeenCalledTimes(1);
    });

    it('permet un nouveau déclenchement après résolution', async () => {
      await setup([alarmScenario()]);
      setDeviceState(MOTION_ID, { occupancy: true });
      await fireFromDevice(MOTION_ID);
      setDeviceState(MOTION_ID, { occupancy: false });
      await fireFromDevice(MOTION_ID);

      setDeviceState(MOTION_ID, { occupancy: true });
      await fireFromDevice(MOTION_ID);

      expect(prisma.__alarmEvents).toHaveLength(2);
      expect(notifications.sendTelegram).toHaveBeenCalledTimes(2);
    });
  });

  describe('non-régression : évaluations concurrentes (comportement actuel)', () => {
    it('ignore un événement arrivant pendant qu\'une exécution est déjà en cours', async () => {
      // Documente le comportement actuel du verrou global `executing` (voir audit
      // Audit-codex-2026-07-11.md, P1) : un événement qui arrive pendant qu'une action est en
      // cours d'exécution est purement perdu, pas mis en file. Ce test fige ce comportement
      // connu ; le faire échouer volontairement est le signal qu'une correction (file/porte
      // par device) a été apportée et que ce test doit être mis à jour en conséquence.
      const scenario = makeScenario({
        trigger: JSON.stringify({ type: 'device_state', deviceId: MOTION_ID, property: 'occupancy', operator: 'eq', value: true }),
        conditions: '[]',
        actions: JSON.stringify([{ type: 'device_command', deviceId: LAMP_ID, command: { state: 'ON' } }]),
      });
      await setup([scenario]);
      setDeviceState(MOTION_ID, { occupancy: true });

      (service as any).executing = true;
      await fireFromDevice(MOTION_ID);
      (service as any).executing = false;

      expect(mqtt.publish).not.toHaveBeenCalled();
      expect(scenario.runCount).toBe(0);
    });
  });

  describe('déclencheur solaire (scheduleSolar)', () => {
    afterEach(() => {
      // Évite les fuites de timers réels entre tests (scheduleSolar arme un vrai setTimeout).
      for (const timer of (service as any).cronTimers.values()) clearTimeout(timer);
    });

    it("calcule l'heure de déclenchement à partir du coucher du soleil + décalage (sans aléa)", async () => {
      const scenario = makeScenario({
        trigger: JSON.stringify({ type: 'solar', reference: 'sunset', offsetMinutes: -15, randomDelayMin: 0, randomDelayMax: 0 }),
        conditions: '[]',
        actions: '[]',
      });
      await setup([scenario]);
      const sunset = new Date(Date.now() + 3 * 60 * 60_000); // dans 3h, donc pas "déjà passé"
      (weather.getSunTimes as any) = vi.fn(async () => ({ sunrise: new Date(), sunset, date: 'today' }));

      await (service as any).scheduleSolar(scenario, { reference: 'sunset', offsetMinutes: -15, randomDelayMin: 0, randomDelayMax: 0 });

      const fireAt = (service as any).nextRunDates.get(scenario.id);
      expect(fireAt.getTime()).toBe(sunset.getTime() - 15 * 60_000);
    });

    it("bascule sur le coucher de soleil de demain si celui d'aujourd'hui est déjà passé", async () => {
      const scenario = makeScenario({
        trigger: JSON.stringify({ type: 'solar', reference: 'sunset', offsetMinutes: 0, randomDelayMin: 0, randomDelayMax: 0 }),
        conditions: '[]',
        actions: '[]',
      });
      await setup([scenario]);
      const sunsetToday = new Date(Date.now() - 60_000); // déjà passé
      const sunsetTomorrow = new Date(Date.now() + 20 * 60 * 60_000);
      (weather.getSunTimes as any) = vi.fn(async (dayOffset: 0 | 1) =>
        dayOffset === 0
          ? { sunrise: new Date(), sunset: sunsetToday, date: 'today' }
          : { sunrise: new Date(), sunset: sunsetTomorrow, date: 'tomorrow' },
      );

      await (service as any).scheduleSolar(scenario, { reference: 'sunset', offsetMinutes: 0, randomDelayMin: 0, randomDelayMax: 0 });

      const fireAt = (service as any).nextRunDates.get(scenario.id);
      expect(fireAt.getTime()).toBe(sunsetTomorrow.getTime());
    });

    it('réessaie plus tard sans planifier de nextRun si les heures solaires sont indisponibles', async () => {
      const scenario = makeScenario({
        trigger: JSON.stringify({ type: 'solar', reference: 'sunrise', offsetMinutes: 0, randomDelayMin: 0, randomDelayMax: 0 }),
        conditions: '[]',
        actions: '[]',
      });
      await setup([scenario]);
      (weather.getSunTimes as any) = vi.fn(async () => null);

      await (service as any).scheduleSolar(scenario, { reference: 'sunrise', offsetMinutes: 0, randomDelayMin: 0, randomDelayMax: 0 });

      expect((service as any).nextRunDates.has(scenario.id)).toBe(false);
      expect((service as any).cronTimers.has(scenario.id)).toBe(true); // timer de nouvelle tentative armé
    });
  });
});
