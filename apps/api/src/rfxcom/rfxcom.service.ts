import { Inject, Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@skbox/db';
import { exec } from 'child_process';
import { promisify } from 'util';
import { MqttService } from '../mqtt/mqtt.service';
import { SettingsService } from '../settings/settings.service';
import { hasSignificantChange } from '../devices/history-change.util';

const execAsync = promisify(exec);

const DEFAULT_WATCHDOG_INTERVAL_SEC = 60;
const DEFAULT_WATCHDOG_TIMEOUT_SEC = 120;
// Délai minimal entre deux relances automatiques du service systemd : évite une boucle
// de redémarrages si le bridge reste indisponible pour une raison que le restart ne
// résout pas (ex. dongle débranché).
const MIN_AUTO_RESTART_INTERVAL_MS = 10 * 60_000;

interface RfxcomPayload {
  id: string;
  type: string;
  subtype: number;
  deviceName: string | string[];
  temperature?: number;
  humidity?: number;
  humidityStatus?: number;
  batteryLevel?: number;
  rssi?: number;
  command?: string;
  group?: boolean;
  [key: string]: unknown;
}

@Injectable()
export class RfxcomService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RfxcomService.name);
  private readonly queues = new Map<string, Promise<void>>();
  private lastMessageAt = 0;
  private bridgeOnline = false;
  private watchdogTimer?: ReturnType<typeof setInterval>;
  private lastAutoRestartAt = 0;

  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly mqtt: MqttService,
    private readonly settings: SettingsService,
  ) {}

  private async getWatchdogTimeoutMs(): Promise<number> {
    const value = await this.settings.get('rfxcom.watchdogTimeoutSec');
    const seconds = value ? parseInt(value, 10) : NaN;
    return (Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_WATCHDOG_TIMEOUT_SEC) * 1000;
  }

  async onModuleInit() {
    // Enregistrement synchrone avant tout await : un message retenu peut être livré dès la
    // connexion MQTT (souvent très rapide en local), et un await avant l'enregistrement
    // (ex. l'accès Prisma de markAllOffline) laisse le temps à ce message d'être manqué.
    this.mqtt.subscribe('rfxcom2mqtt/bridge/status', (_, payload) => {
      this.lastMessageAt = Date.now();
      this.logger.log(`rfxcom2mqtt bridge: ${payload}`);
      this.handleBridgeStatus(payload);
    });

    this.mqtt.subscribe('rfxcom2mqtt/devices/+', (topic, payload) => {
      this.lastMessageAt = Date.now();
      const deviceId = topic.split('/')[2];
      this.enqueue(deviceId, payload);
    });

    this.mqtt.onDisconnect(() => {
      this.bridgeOnline = false;
      this.markAllOffline();
    });

    await this.markAllOffline();

    const intervalValue = await this.settings.get('rfxcom.watchdogIntervalSec');
    const intervalSec = intervalValue ? parseInt(intervalValue, 10) : NaN;
    const intervalMs =
      (Number.isFinite(intervalSec) && intervalSec > 0 ? intervalSec : DEFAULT_WATCHDOG_INTERVAL_SEC) * 1000;

    this.watchdogTimer = setInterval(() => this.watchdog(), intervalMs);
  }

  onModuleDestroy() {
    if (this.watchdogTimer) clearInterval(this.watchdogTimer);
  }

  private async watchdog() {
    if (!this.mqtt.isConnected || !this.bridgeOnline) return;

    const timeoutMs = await this.getWatchdogTimeoutMs();
    const elapsed = Date.now() - this.lastMessageAt;
    if (elapsed > timeoutMs) {
      this.logger.warn(`No rfxcom2mqtt message for ${Math.round(elapsed / 1000)}s — marking RF devices offline`);
      this.bridgeOnline = false;
      await this.markAllOffline();
      await this.maybeAutoRestart();
    }
  }

  isBridgeOnline(): boolean {
    return this.bridgeOnline;
  }

  private async markAllOffline() {
    const result = await this.prisma.device.updateMany({
      where: { protocol: 'rf433', status: 'online' },
      data: { status: 'offline' },
    });
    if (result.count > 0) {
      this.logger.warn(`Marked ${result.count} RF device(s) offline`);
    }
  }

  private async maybeAutoRestart() {
    const enabled = (await this.settings.get('rfxcom.autoRestartEnabled')) === 'true';
    if (!enabled) return;

    const elapsed = Date.now() - this.lastAutoRestartAt;
    if (elapsed < MIN_AUTO_RESTART_INTERVAL_MS) return;

    this.lastAutoRestartAt = Date.now();
    this.logger.warn('Auto-restarting skbox-rfxcom (bridge offline)');
    try {
      await execAsync('sudo systemctl restart skbox-rfxcom', { timeout: 10_000 });
    } catch (err: any) {
      this.logger.error(`Failed to auto-restart skbox-rfxcom: ${err?.stderr?.trim() || err?.message}`);
    }
  }

  private enqueue(deviceId: string, payload: string) {
    const prev = this.queues.get(deviceId) ?? Promise.resolve();
    const next = prev.then(() =>
      this.handleDeviceState(deviceId, payload).catch((err) =>
        this.logger.error(`Error processing RF device ${deviceId}: ${err}`),
      ),
    );
    this.queues.set(deviceId, next);
  }

  private async handleDeviceState(deviceId: string, payload: string) {
    let data: RfxcomPayload;
    try {
      data = JSON.parse(payload);
    } catch {
      return;
    }

    const rfxcomId = `${data.type}/${data.id}`;
    const deviceType = this.inferDeviceType(data);
    const vendor = this.inferVendor(data);
    const modelName = this.formatDeviceName(data.deviceName);

    const existing = await this.prisma.device.findUnique({ where: { rfxcomId } });
    if (existing && !existing.active) return;

    const stateData: Record<string, unknown> = {};
    if (data.temperature !== undefined) stateData.temperature = data.temperature;
    if (data.humidity !== undefined) stateData.humidity = data.humidity;
    if (data.humidityStatus !== undefined) stateData.humidityStatus = data.humidityStatus;
    if (data.batteryLevel !== undefined) stateData.battery = data.batteryLevel > 5 ? 100 : 10;
    if (data.rssi !== undefined) stateData.rssi = data.rssi;
    if (data.command !== undefined) stateData.command = data.command;

    const device = await this.prisma.device.upsert({
      where: { rfxcomId },
      update: {
        state: JSON.stringify(stateData),
        status: 'online',
        lastSeen: new Date(),
      },
      create: {
        name: modelName || rfxcomId,
        protocol: 'rf433',
        type: deviceType,
        rfxcomId,
        vendor,
        model: modelName,
        mqttTopic: `rfxcom2mqtt/devices/${data.id}`,
        status: 'online',
        state: JSON.stringify(stateData),
      },
    });

    if (device.trackHistory && hasSignificantChange(existing?.state, stateData, existing?.historyFieldConfig)) {
      await this.prisma.deviceEvent.create({
        data: {
          deviceId: device.id,
          event: 'state_update',
          data: JSON.stringify(stateData),
        },
      });
    }
  }

  private async handleBridgeStatus(payload: string) {
    let status: string;
    try {
      const data = JSON.parse(payload);
      status = data.status ?? data.state ?? payload;
    } catch {
      status = payload;
    }

    if (status === 'online') {
      this.bridgeOnline = true;
      this.lastMessageAt = Date.now();
    } else if (status === 'offline') {
      this.bridgeOnline = false;
      await this.markAllOffline();
      await this.maybeAutoRestart();
    }
  }

  async sendCommand(rfxcomId: string, command: Record<string, unknown>) {
    const device = await this.prisma.device.findUnique({ where: { rfxcomId } });

    if (!device) {
      throw new Error(`RF device ${rfxcomId} not found`);
    }
    if (!device.active) {
      throw new Error(`RF device ${rfxcomId} is inactive`);
    }

    const [type] = rfxcomId.split('/');
    this.mqtt.publish(
      `rfxcom2mqtt/command/${type}/${device.rfxcomId?.split('/')[1]}`,
      JSON.stringify(command),
    );
  }

  private formatDeviceName(deviceName: string | string[]): string {
    if (Array.isArray(deviceName)) return deviceName[0] || '';
    return deviceName || '';
  }

  private inferDeviceType(data: RfxcomPayload): string {
    const type = data.type.toLowerCase();

    if (type.includes('temperaturehumidity')) return 'sensor_temperature';
    if (type.includes('temperature')) return 'sensor_temperature';
    if (type.includes('humidity')) return 'sensor_humidity';
    if (type.includes('rain')) return 'sensor_rain';
    if (type.includes('wind')) return 'sensor_wind';
    if (type.includes('uv')) return 'sensor_uv';
    if (type.includes('lighting')) return 'switch';
    if (type.includes('remote')) return 'remote';

    if (data.temperature !== undefined) return 'sensor_temperature';
    if (data.humidity !== undefined) return 'sensor_humidity';
    if (data.command !== undefined) return 'switch';

    return 'switch';
  }

  private inferVendor(data: RfxcomPayload): string {
    const type = data.type.toLowerCase();
    if (type.includes('temperaturehumidity') || type.includes('rain') || type.includes('wind') || type.includes('uv')) {
      return 'Oregon Scientific';
    }
    if (type.includes('lighting')) return 'Chacon/DIO';
    return 'Unknown';
  }
}
