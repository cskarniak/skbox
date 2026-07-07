import { Inject, Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@skbox/db';
import { exec } from 'child_process';
import { promisify } from 'util';
import { MqttService } from '../mqtt/mqtt.service';
import { SettingsService } from '../settings/settings.service';
import { SystemEventsService } from '../system-events/system-events.service';
import { hasSignificantChange } from '../devices/history-change.util';

const execAsync = promisify(exec);

const DEFAULT_HEALTHCHECK_INTERVAL_SEC = 60;
const DEFAULT_HEALTHCHECK_TIMEOUT_SEC = 120;
// Délai minimal entre deux relances automatiques du service systemd : évite une boucle
// de redémarrages si le bridge reste indisponible pour une raison que le restart ne
// résout pas (ex. dongle débranché).
const MIN_AUTO_RESTART_INTERVAL_MS = 10 * 60_000;

interface Z2MDevice {
  ieee_address: string;
  friendly_name: string;
  type: 'Coordinator' | 'Router' | 'EndDevice';
  definition?: {
    model: string;
    vendor: string;
    description: string;
    exposes: Z2MExpose[];
  };
  supported: boolean;
  interview_completed: boolean;
}

interface Z2MExpose {
  type: string;
  name?: string;
  features?: Z2MExpose[];
}

@Injectable()
export class ZigbeeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ZigbeeService.name);
  private lastMessageAt = 0;
  private bridgeOnline = false;
  private healthcheckTimer?: ReturnType<typeof setInterval>;
  private lastAutoRestartAt = 0;

  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly mqtt: MqttService,
    private readonly settings: SettingsService,
    private readonly events: SystemEventsService,
  ) {}

  private async getHealthcheckTimeoutMs(): Promise<number> {
    const value = await this.settings.get('zigbee.healthcheckTimeoutSec');
    const seconds = value ? parseInt(value, 10) : NaN;
    return (Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_HEALTHCHECK_TIMEOUT_SEC) * 1000;
  }

  async onModuleInit() {
    // Les abonnements doivent être enregistrés de façon synchrone, avant tout await :
    // le message retenu "bridge/devices" peut être livré dès la connexion MQTT (souvent
    // très rapide en local), et un await avant l'enregistrement (ex. l'accès Prisma de
    // markAllOffline) laisse largement le temps à ce message d'arriver et d'être manqué.
    this.mqtt.subscribe('zigbee2mqtt/bridge/devices', (_, payload) => {
      this.lastMessageAt = Date.now();
      this.handleDeviceList(payload);
    });

    this.mqtt.subscribe('zigbee2mqtt/bridge/state', (_, payload) => {
      this.lastMessageAt = Date.now();
      this.handleBridgeState(payload);
    });

    this.mqtt.subscribe('zigbee2mqtt/+', (topic, payload) => {
      this.lastMessageAt = Date.now();
      const name = topic.split('/')[1];
      if (name === 'bridge') return;
      this.handleDeviceState(name, payload);
    });

    this.mqtt.subscribe('zigbee2mqtt/+/availability', (topic, payload) => {
      this.lastMessageAt = Date.now();
      const name = topic.split('/')[1];
      this.handleAvailability(name, payload);
    });

    this.mqtt.subscribe('zigbee2mqtt/bridge/event', (_, payload) => {
      this.lastMessageAt = Date.now();
      this.handleBridgeEvent(payload);
    });

    this.mqtt.subscribe('zigbee2mqtt/bridge/response/health_check', () => {
      this.lastMessageAt = Date.now();
    });

    this.mqtt.onDisconnect(() => {
      this.bridgeOnline = false;
      this.markAllOffline();
    });

    // Filet de sécurité si malgré tout aucun message retenu n'a été livré à temps.
    this.mqtt.publish('zigbee2mqtt/bridge/request/devices', '');

    await this.markAllOffline();

    const intervalValue = await this.settings.get('zigbee.healthcheckIntervalSec');
    const intervalSec = intervalValue ? parseInt(intervalValue, 10) : NaN;
    const intervalMs =
      (Number.isFinite(intervalSec) && intervalSec > 0 ? intervalSec : DEFAULT_HEALTHCHECK_INTERVAL_SEC) * 1000;

    this.healthcheckTimer = setInterval(() => this.healthcheck(), intervalMs);
  }

  onModuleDestroy() {
    if (this.healthcheckTimer) clearInterval(this.healthcheckTimer);
  }

  private async healthcheck() {
    if (!this.mqtt.isConnected) return;

    if (!this.bridgeOnline) {
      this.mqtt.publish('zigbee2mqtt/bridge/request/health_check', '');
      return;
    }

    const timeoutMs = await this.getHealthcheckTimeoutMs();
    const elapsed = Date.now() - this.lastMessageAt;
    if (elapsed > timeoutMs) {
      this.logger.warn(`No Zigbee2MQTT message for ${Math.round(elapsed / 1000)}s — sending health check`);
      this.mqtt.publish('zigbee2mqtt/bridge/request/health_check', '');

      setTimeout(async () => {
        if (Date.now() - this.lastMessageAt > timeoutMs) {
          this.logger.warn('Zigbee2MQTT health check timeout — marking devices offline');
          this.bridgeOnline = false;
          await this.markAllOffline();
          await this.maybeAutoRestart();
        }
      }, 10_000);
    }
  }

  isBridgeOnline(): boolean {
    return this.bridgeOnline;
  }

  private async markAllOffline() {
    const result = await this.prisma.device.updateMany({
      where: { protocol: 'zigbee', status: 'online' },
      data: { status: 'offline' },
    });
    if (result.count > 0) {
      this.logger.warn(`Marked ${result.count} Zigbee device(s) offline`);
      await this.events.log('zigbee', 'offline', `${result.count} appareil(s) marqué(s) hors-ligne`);
    }
  }

  private async maybeAutoRestart() {
    const enabled = (await this.settings.get('zigbee.autoRestartEnabled')) === 'true';
    if (!enabled) return;

    const elapsed = Date.now() - this.lastAutoRestartAt;
    if (elapsed < MIN_AUTO_RESTART_INTERVAL_MS) return;

    this.lastAutoRestartAt = Date.now();
    this.logger.warn('Auto-restarting skbox-z2m (bridge offline)');
    try {
      await execAsync('sudo systemctl restart skbox-z2m', { timeout: 10_000 });
      await this.events.log('zigbee', 'auto_restart', 'skbox-z2m relancé automatiquement');
    } catch (err: any) {
      const message = err?.stderr?.trim() || err?.message;
      this.logger.error(`Failed to auto-restart skbox-z2m: ${message}`);
      await this.events.log('zigbee', 'auto_restart', `Échec de la relance automatique : ${message}`);
    }
  }

  private async handleBridgeState(payload: string) {
    let state: string;
    try {
      const data = JSON.parse(payload);
      state = data.state ?? payload;
    } catch {
      state = payload;
    }
    this.logger.log(`Zigbee2MQTT bridge: ${state}`);

    if (state === 'online') {
      if (!this.bridgeOnline) {
        await this.events.log('zigbee', 'reconnected');
      }
      this.bridgeOnline = true;
      this.lastMessageAt = Date.now();
    } else if (state === 'offline') {
      this.bridgeOnline = false;
      await this.markAllOffline();
      await this.maybeAutoRestart();
    }
  }

  private async handleDeviceList(payload: string) {
    let devices: Z2MDevice[];
    try {
      devices = JSON.parse(payload);
    } catch {
      this.logger.error('Failed to parse device list');
      return;
    }

    for (const z2mDevice of devices) {
      if (z2mDevice.type === 'Coordinator') continue;
      // z2mDevice.supported reflects presence in Z2M's official device database, not
      // usability — Z2M still auto-generates a working definition (with real exposes)
      // for unrecognized devices like the Shelly's "automatically generated definition".
      // Only skip devices Z2M genuinely couldn't expose anything for.
      if (!z2mDevice.definition?.exposes?.length) continue;

      const deviceType = this.inferDeviceType(z2mDevice);

      try {
        await this.prisma.device.upsert({
          where: { ieeeAddress: z2mDevice.ieee_address },
          update: {
            name: z2mDevice.friendly_name,
            vendor: z2mDevice.definition?.vendor,
            model: z2mDevice.definition?.model,
            mqttTopic: `zigbee2mqtt/${z2mDevice.friendly_name}`,
          },
          create: {
            name: z2mDevice.friendly_name,
            protocol: 'zigbee',
            type: deviceType,
            ieeeAddress: z2mDevice.ieee_address,
            vendor: z2mDevice.definition?.vendor,
            model: z2mDevice.definition?.model,
            mqttTopic: `zigbee2mqtt/${z2mDevice.friendly_name}`,
            status: 'online',
          },
        });

        this.logger.log(`Synced device: ${z2mDevice.friendly_name} (${z2mDevice.ieee_address})`);
      } catch (err) {
        this.logger.error(`Failed to sync device ${z2mDevice.friendly_name}: ${err}`);
      }
    }
  }

  private async handleDeviceState(friendlyName: string, payload: string) {
    let state: Record<string, unknown>;
    try {
      state = JSON.parse(payload);
    } catch {
      return;
    }

    const device = await this.prisma.device.findFirst({
      where: { mqttTopic: `zigbee2mqtt/${friendlyName}` },
    });

    if (!device || !device.active) return;

    await this.prisma.device.update({
      where: { id: device.id },
      data: {
        state: JSON.stringify(state),
        status: 'online',
        lastSeen: new Date(),
      },
    });

    if (device.trackHistory && hasSignificantChange(device.state, state, device.historyFieldConfig)) {
      await this.prisma.deviceEvent.create({
        data: {
          deviceId: device.id,
          event: 'state_update',
          data: JSON.stringify(state),
        },
      });
    }
  }

  private async handleAvailability(friendlyName: string, payload: string) {
    let state: string;
    try {
      state = (JSON.parse(payload) as { state: string }).state;
    } catch {
      state = payload;
    }
    if (state !== 'online' && state !== 'offline') return;

    const device = await this.prisma.device.findFirst({
      where: { mqttTopic: `zigbee2mqtt/${friendlyName}` },
    });
    if (!device || !device.active) return;

    await this.prisma.device.update({
      where: { id: device.id },
      data: { status: state },
    });
    this.logger.log(`Device ${friendlyName} is now ${state} (availability)`);
  }

  private handleBridgeEvent(payload: string) {
    try {
      const event = JSON.parse(payload);
      this.logger.log(`Bridge event: ${event.type} — ${JSON.stringify(event.data)}`);

      if (event.type === 'device_joined' || event.type === 'device_announce') {
        this.mqtt.publish('zigbee2mqtt/bridge/request/devices', '');
      }
    } catch {
      // ignore
    }
  }

  async sendCommand(ieeeAddress: string, command: Record<string, unknown>) {
    const device = await this.prisma.device.findUnique({
      where: { ieeeAddress },
    });

    if (!device?.mqttTopic) {
      throw new Error(`Device ${ieeeAddress} not found or has no MQTT topic`);
    }
    if (!device.active) {
      throw new Error(`Device ${ieeeAddress} is inactive`);
    }

    this.mqtt.publish(`${device.mqttTopic}/set`, JSON.stringify(command));
  }

  async permitJoin(enable: boolean, duration = 120) {
    const payload = JSON.stringify({ value: enable, time: duration });
    this.mqtt.publish('zigbee2mqtt/bridge/request/permit_join', payload);
    this.logger.log(`Permit join: ${enable} (${duration}s)`);
  }

  private inferDeviceType(z2mDevice: Z2MDevice): string {
    const exposes = z2mDevice.definition?.exposes ?? [];
    const allFeatures = this.flattenExposes(exposes);
    const names = allFeatures.map((e) => e.name).filter(Boolean);

    if (names.includes('state') && names.includes('brightness')) return 'light';
    if (names.includes('state')) return 'switch';
    if (names.includes('temperature')) return 'sensor_temperature';
    if (names.includes('humidity')) return 'sensor_humidity';
    if (names.includes('occupancy')) return 'sensor_motion';
    if (names.includes('contact')) return 'sensor_door';
    if (names.includes('current_heating_setpoint')) return 'thermostat';
    if (names.includes('power')) return 'plug';

    return 'switch';
  }

  private flattenExposes(exposes: Z2MExpose[]): Z2MExpose[] {
    const result: Z2MExpose[] = [];
    for (const expose of exposes) {
      result.push(expose);
      if (expose.features) {
        result.push(...this.flattenExposes(expose.features));
      }
    }
    return result;
  }
}
