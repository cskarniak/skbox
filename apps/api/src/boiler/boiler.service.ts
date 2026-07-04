import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@skbox/db';
import { MqttService } from '../mqtt/mqtt.service';
import { SettingsService } from '../settings/settings.service';

export interface BoilerSlot {
  day: number; // 0 = lundi ... 6 = dimanche
  from: string; // "HH:MM"
  to: string; // "HH:MM"
}

export interface BoilerOverride {
  mode: 'on' | 'off';
  until: string; // ISO
}

interface BoilerState {
  deviceId: string | null;
  schedule: BoilerSlot[];
  minOnMinutes: number;
  minOffMinutes: number;
  override: BoilerOverride | null;
  lastChangeAt: string | null;
  lastCommandedState: 'ON' | 'OFF' | null;
}

export interface BoilerConfig {
  deviceId: string | null;
  schedule: BoilerSlot[];
  minOnMinutes: number;
  minOffMinutes: number;
}

export interface BoilerStatus {
  deviceId: string | null;
  deviceName: string | null;
  deviceOnline: boolean;
  commandedState: 'ON' | 'OFF' | null;
  desiredState: 'ON' | 'OFF';
  scheduleActive: boolean;
  override: BoilerOverride | null;
  lastChangeAt: string | null;
}

const STATE_KEY = 'boiler';
const TICK_MS = 60_000;

const DEFAULT_STATE: BoilerState = {
  deviceId: null,
  schedule: [],
  minOnMinutes: 10,
  minOffMinutes: 5,
  override: null,
  lastChangeAt: null,
  lastCommandedState: null,
};

@Injectable()
export class BoilerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BoilerService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly mqtt: MqttService,
    private readonly settings: SettingsService,
  ) {}

  async onModuleInit() {
    this.timer = setInterval(() => this.evaluate(), TICK_MS);
    await this.evaluate();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async loadState(): Promise<BoilerState> {
    const raw = await this.settings.get(STATE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    try {
      return { ...DEFAULT_STATE, ...JSON.parse(raw) };
    } catch {
      return { ...DEFAULT_STATE };
    }
  }

  private async saveState(state: BoilerState): Promise<void> {
    await this.settings.set(STATE_KEY, JSON.stringify(state));
  }

  async getConfig(): Promise<BoilerConfig> {
    const state = await this.loadState();
    return {
      deviceId: state.deviceId,
      schedule: state.schedule,
      minOnMinutes: state.minOnMinutes,
      minOffMinutes: state.minOffMinutes,
    };
  }

  async setConfig(config: BoilerConfig): Promise<BoilerConfig> {
    for (const slot of config.schedule) {
      if (!/^\d{2}:\d{2}$/.test(slot.from) || !/^\d{2}:\d{2}$/.test(slot.to)) {
        throw new BadRequestException(`Créneau invalide: ${slot.from}-${slot.to}`);
      }
      if (slot.day < 0 || slot.day > 6) {
        throw new BadRequestException(`Jour invalide: ${slot.day}`);
      }
    }
    if (config.minOnMinutes < 0 || config.minOffMinutes < 0) {
      throw new BadRequestException('Les durées minimales ne peuvent pas être négatives');
    }

    const state = await this.loadState();
    const next: BoilerState = {
      ...state,
      deviceId: config.deviceId,
      schedule: config.schedule,
      minOnMinutes: config.minOnMinutes,
      minOffMinutes: config.minOffMinutes,
    };
    await this.saveState(next);
    await this.evaluate();
    return this.getConfig();
  }

  async setBoost(mode: 'on' | 'off', minutes: number): Promise<BoilerStatus> {
    const state = await this.loadState();
    const until = new Date(Date.now() + minutes * 60_000).toISOString();
    await this.saveState({ ...state, override: { mode, until } });
    await this.evaluate();
    return this.getStatus();
  }

  async clearBoost(): Promise<BoilerStatus> {
    const state = await this.loadState();
    await this.saveState({ ...state, override: null });
    await this.evaluate();
    return this.getStatus();
  }

  async getStatus(): Promise<BoilerStatus> {
    const state = await this.loadState();
    const device = state.deviceId
      ? await this.prisma.device.findUnique({ where: { id: state.deviceId } })
      : null;

    const activeOverride =
      state.override && new Date(state.override.until).getTime() > Date.now()
        ? state.override
        : null;

    return {
      deviceId: state.deviceId,
      deviceName: device?.name ?? null,
      deviceOnline: device?.status === 'online',
      commandedState: state.lastCommandedState,
      desiredState: this.computeDesiredState(state, activeOverride),
      scheduleActive: this.isWithinSchedule(state.schedule, new Date()),
      override: activeOverride,
      lastChangeAt: state.lastChangeAt,
    };
  }

  private computeDesiredState(state: BoilerState, activeOverride: BoilerOverride | null): 'ON' | 'OFF' {
    if (activeOverride) return activeOverride.mode === 'on' ? 'ON' : 'OFF';
    return this.isWithinSchedule(state.schedule, new Date()) ? 'ON' : 'OFF';
  }

  private isWithinSchedule(schedule: BoilerSlot[], now: Date): boolean {
    const day = (now.getDay() + 6) % 7; // JS: 0=dimanche -> 0=lundi..6=dimanche
    const current = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    return schedule.some((slot) => {
      if (slot.day !== day) return false;
      if (slot.from <= slot.to) return current >= slot.from && current < slot.to;
      return current >= slot.from || current < slot.to; // créneau traversant minuit
    });
  }

  private async evaluate(): Promise<void> {
    const state = await this.loadState();
    if (!state.deviceId) return;

    const activeOverride =
      state.override && new Date(state.override.until).getTime() > Date.now()
        ? state.override
        : null;
    // Dérogation expirée : on l'efface pour revenir proprement au planning.
    if (state.override && !activeOverride) {
      state.override = null;
      await this.saveState(state);
    }

    const desired = this.computeDesiredState(state, activeOverride);
    const current = state.lastCommandedState;

    if (current === desired) return;

    const now = Date.now();
    const sinceChange = state.lastChangeAt ? now - new Date(state.lastChangeAt).getTime() : Infinity;
    // Anti-cycle court : on respecte la durée mini de l'état en cours avant de changer.
    const minMs = (current === 'ON' ? state.minOnMinutes : state.minOffMinutes) * 60_000;
    if (current !== null && sinceChange < minMs) {
      this.logger.log(
        `Chaudière : changement vers ${desired} différé (anti-cycle, ${Math.ceil((minMs - sinceChange) / 60_000)} min restantes)`,
      );
      return;
    }

    const device = await this.prisma.device.findUnique({ where: { id: state.deviceId } });
    if (!device?.mqttTopic) {
      this.logger.warn(`Chaudière : device ${state.deviceId} introuvable ou sans topic MQTT`);
      return;
    }

    this.mqtt.publish(`${device.mqttTopic}/set`, JSON.stringify({ state: desired }));
    this.logger.log(`Chaudière : ${device.name} → ${desired}`);

    state.lastCommandedState = desired;
    state.lastChangeAt = new Date(now).toISOString();
    await this.saveState(state);
  }
}
