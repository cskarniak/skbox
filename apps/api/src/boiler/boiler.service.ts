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

export type LevelKey = 'eco' | 'confort' | 'confort_plus' | 'vacances' | 'nuit';

export const LEVEL_LABELS: Record<LevelKey, string> = {
  eco: 'Éco',
  confort: 'Confort',
  confort_plus: 'Confort+',
  vacances: 'Vacances',
  nuit: 'Nuit',
};

const LEVEL_KEYS: LevelKey[] = ['eco', 'confort', 'confort_plus', 'vacances', 'nuit'];

const DEFAULT_LEVEL_TEMPS: Record<LevelKey, number> = {
  eco: 17,
  confort: 19,
  confort_plus: 21,
  vacances: 12,
  nuit: 16,
};

export interface ProgramSlot {
  from: string; // "HH:MM"
  to: string; // "HH:MM"
  level: LevelKey;
}

export interface BoilerProgram {
  id: string;
  name: string;
  slots: ProgramSlot[];
}

// jour de la semaine (0 = lundi ... 6 = dimanche) -> id de programme, ou null (niveau par défaut toute la journée)
export type DayPrograms = Record<number, string | null>;

export interface BoilerOverride {
  level: LevelKey;
  until: string; // ISO
}

interface BoilerState {
  deviceId: string | null;
  temperatureSensorId: string | null;
  hysteresis: number;
  levels: Record<LevelKey, number>;
  defaultLevel: LevelKey;
  programs: BoilerProgram[];
  dayPrograms: DayPrograms;
  minOnMinutes: number;
  minOffMinutes: number;
  override: BoilerOverride | null;
  lastChangeAt: string | null;
  lastCommandedState: 'ON' | 'OFF' | null;
  enabled: boolean;
}

export interface BoilerConfig {
  deviceId: string | null;
  temperatureSensorId: string | null;
  hysteresis: number;
  levels: Record<LevelKey, number>;
  defaultLevel: LevelKey;
  programs: BoilerProgram[];
  dayPrograms: DayPrograms;
  minOnMinutes: number;
  minOffMinutes: number;
}

export interface BoilerStatus {
  deviceId: string | null;
  deviceName: string | null;
  deviceOnline: boolean;
  commandedState: 'ON' | 'OFF' | null;
  desiredState: 'ON' | 'OFF';
  activeLevel: LevelKey;
  targetTemp: number;
  currentTemp: number | null;
  scheduleActive: boolean;
  override: BoilerOverride | null;
  lastChangeAt: string | null;
  enabled: boolean;
}

const STATE_KEY = 'boiler';
const TICK_MS = 60_000;

function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

const DEFAULT_STATE: BoilerState = {
  deviceId: null,
  temperatureSensorId: null,
  hysteresis: 0.3,
  levels: { ...DEFAULT_LEVEL_TEMPS },
  defaultLevel: 'eco',
  programs: [],
  dayPrograms: {},
  minOnMinutes: 10,
  minOffMinutes: 5,
  override: null,
  lastChangeAt: null,
  lastCommandedState: null,
  enabled: true,
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
    if (!raw) return { ...DEFAULT_STATE, levels: { ...DEFAULT_LEVEL_TEMPS } };
    try {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_STATE,
        ...parsed,
        levels: { ...DEFAULT_LEVEL_TEMPS, ...parsed.levels },
        programs: Array.isArray(parsed.programs) ? parsed.programs : [],
        dayPrograms: parsed.dayPrograms ?? {},
      };
    } catch {
      return { ...DEFAULT_STATE, levels: { ...DEFAULT_LEVEL_TEMPS } };
    }
  }

  private async saveState(state: BoilerState): Promise<void> {
    await this.settings.set(STATE_KEY, JSON.stringify(state));
  }

  async getConfig(): Promise<BoilerConfig> {
    const state = await this.loadState();
    return {
      deviceId: state.deviceId,
      temperatureSensorId: state.temperatureSensorId,
      hysteresis: state.hysteresis,
      levels: state.levels,
      defaultLevel: state.defaultLevel,
      programs: state.programs,
      dayPrograms: state.dayPrograms,
      minOnMinutes: state.minOnMinutes,
      minOffMinutes: state.minOffMinutes,
    };
  }

  async setConfig(config: BoilerConfig): Promise<BoilerConfig> {
    const programIds = new Set<string>();
    for (const program of config.programs) {
      if (!program.id || !program.name.trim()) {
        throw new BadRequestException('Un programme doit avoir un id et un nom');
      }
      if (programIds.has(program.id)) {
        throw new BadRequestException(`Id de programme dupliqué: ${program.id}`);
      }
      programIds.add(program.id);
      for (const slot of program.slots) {
        if (!/^\d{2}:\d{2}$/.test(slot.from) || !/^\d{2}:\d{2}$/.test(slot.to)) {
          throw new BadRequestException(`Créneau invalide dans "${program.name}": ${slot.from}-${slot.to}`);
        }
        if (!LEVEL_KEYS.includes(slot.level)) {
          throw new BadRequestException(`Niveau invalide dans "${program.name}": ${slot.level}`);
        }
      }
      this.assertNoOverlap(program);
    }
    for (const [day, programId] of Object.entries(config.dayPrograms)) {
      const dayNum = Number(day);
      if (dayNum < 0 || dayNum > 6) {
        throw new BadRequestException(`Jour invalide: ${day}`);
      }
      if (programId !== null && !programIds.has(programId)) {
        throw new BadRequestException(`Programme introuvable pour le jour ${day}: ${programId}`);
      }
    }
    if (!LEVEL_KEYS.includes(config.defaultLevel)) {
      throw new BadRequestException(`Niveau par défaut invalide: ${config.defaultLevel}`);
    }
    for (const key of LEVEL_KEYS) {
      if (typeof config.levels[key] !== 'number' || Number.isNaN(config.levels[key])) {
        throw new BadRequestException(`Température cible invalide pour le niveau ${key}`);
      }
    }
    if (config.minOnMinutes < 0 || config.minOffMinutes < 0) {
      throw new BadRequestException('Les durées minimales ne peuvent pas être négatives');
    }
    if (config.hysteresis < 0) {
      throw new BadRequestException("L'hystérésis ne peut pas être négative");
    }

    // Trie les créneaux par heure de début : l'utilisateur peut les saisir dans n'importe quel
    // ordre, l'affichage (et la relecture après sauvegarde) reste toujours chronologique.
    const sortedPrograms = config.programs.map((program) => ({
      ...program,
      slots: [...program.slots].sort((a, b) => toMinutes(a.from) - toMinutes(b.from)),
    }));

    const state = await this.loadState();
    const next: BoilerState = {
      ...state,
      deviceId: config.deviceId,
      temperatureSensorId: config.temperatureSensorId,
      hysteresis: config.hysteresis,
      levels: config.levels,
      defaultLevel: config.defaultLevel,
      programs: sortedPrograms,
      dayPrograms: config.dayPrograms,
      minOnMinutes: config.minOnMinutes,
      minOffMinutes: config.minOffMinutes,
    };
    await this.saveState(next);
    await this.evaluate();
    return this.getConfig();
  }

  async setBoost(level: LevelKey, minutes: number): Promise<BoilerStatus> {
    if (!LEVEL_KEYS.includes(level)) throw new BadRequestException(`Niveau invalide: ${level}`);
    const state = await this.loadState();
    const until = new Date(Date.now() + minutes * 60_000).toISOString();
    await this.saveState({ ...state, override: { level, until } });
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
    const currentTemp = await this.readCurrentTemp(state);

    const activeOverride = this.activeOverride(state);
    const activeLevel = this.computeActiveLevel(state, activeOverride);

    return {
      deviceId: state.deviceId,
      deviceName: device?.name ?? null,
      deviceOnline: device?.status === 'online',
      commandedState: state.lastCommandedState,
      desiredState: this.computeDesiredState(state, activeLevel, currentTemp),
      activeLevel,
      targetTemp: state.levels[activeLevel],
      currentTemp,
      scheduleActive: this.levelFromProgram(state, new Date()) !== null,
      override: activeOverride,
      lastChangeAt: state.lastChangeAt,
      enabled: state.enabled,
    };
  }

  // Coupure d'urgence : arrête la régulation automatique (plus aucune commande envoyée) et
  // coupe immédiatement le relais, utile pour isoler un bug sans devoir désactiver l'appareil
  // ou débrancher la sonde. La réactivation reprend la régulation au prochain cycle.
  async setEnabled(enabled: boolean): Promise<BoilerStatus> {
    const state = await this.loadState();
    const next: BoilerState = { ...state, enabled };

    if (!enabled && state.deviceId) {
      const device = await this.prisma.device.findUnique({ where: { id: state.deviceId } });
      if (device?.mqttTopic) {
        this.mqtt.publish(`${device.mqttTopic}/set`, JSON.stringify({ state: 'OFF' }));
        next.lastCommandedState = 'OFF';
        next.lastChangeAt = new Date().toISOString();
        this.logger.log(`Chaudière : arrêt d'urgence, ${device.name} → OFF`);
      }
    }

    await this.saveState(next);
    if (enabled) await this.evaluate();
    return this.getStatus();
  }

  // Le matching de créneau (levelFromProgram) prend le premier créneau qui correspond dans
  // l'ordre du tableau : deux créneaux qui se chevauchent donneraient un résultat dépendant de
  // cet ordre, silencieusement, sans que l'utilisateur s'en rende compte. On l'interdit donc à
  // l'enregistrement plutôt que de laisser un comportement ambigu.
  private assertNoOverlap(program: BoilerProgram): void {
    const toMinuteRanges = (slot: ProgramSlot): [number, number][] => {
      const start = toMinutes(slot.from);
      const end = toMinutes(slot.to);
      if (start < end) return [[start, end]];
      return [
        [start, 24 * 60],
        [0, end],
      ]; // créneau traversant minuit, scindé en deux plages
    };
    const overlaps = (a: [number, number], b: [number, number]) => a[0] < b[1] && b[0] < a[1];

    for (let i = 0; i < program.slots.length; i++) {
      for (let j = i + 1; j < program.slots.length; j++) {
        const a = program.slots[i];
        const b = program.slots[j];
        const aRanges = toMinuteRanges(a);
        const bRanges = toMinuteRanges(b);
        const conflict = aRanges.some((ra) => bRanges.some((rb) => overlaps(ra, rb)));
        if (conflict) {
          throw new BadRequestException(
            `Créneaux qui se chevauchent dans "${program.name}" : ${a.from}-${a.to} et ${b.from}-${b.to}`,
          );
        }
      }
    }
  }

  private activeOverride(state: BoilerState): BoilerOverride | null {
    return state.override && new Date(state.override.until).getTime() > Date.now()
      ? state.override
      : null;
  }

  private computeActiveLevel(state: BoilerState, activeOverride: BoilerOverride | null): LevelKey {
    if (activeOverride) return activeOverride.level;
    return this.levelFromProgram(state, new Date()) ?? state.defaultLevel;
  }

  private levelFromProgram(state: BoilerState, now: Date): LevelKey | null {
    const day = (now.getDay() + 6) % 7; // JS: 0=dimanche -> 0=lundi..6=dimanche
    const programId = state.dayPrograms[day];
    if (!programId) return null;
    const program = state.programs.find((p) => p.id === programId);
    if (!program) return null;

    const current = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const slot = program.slots.find((s) => {
      if (s.from <= s.to) return current >= s.from && current < s.to;
      return current >= s.from || current < s.to; // créneau traversant minuit
    });
    return slot?.level ?? null;
  }

  private async readCurrentTemp(state: BoilerState): Promise<number | null> {
    if (!state.temperatureSensorId) return null;
    const sensor = await this.prisma.device.findUnique({ where: { id: state.temperatureSensorId } });
    if (!sensor) return null;
    const parsed = JSON.parse(sensor.state || '{}');
    const temp = Number(parsed.temperature);
    return Number.isFinite(temp) ? temp : null;
  }

  /**
   * Régulation par hystérésis : sous la cible - marge -> ON, au-dessus de la cible + marge -> OFF,
   * entre les deux -> on garde l'état commandé courant (zone morte, évite l'oscillation).
   */
  private computeDesiredState(
    state: BoilerState,
    activeLevel: LevelKey,
    currentTemp: number | null,
  ): 'ON' | 'OFF' {
    if (currentTemp === null) return state.lastCommandedState ?? 'OFF';

    const target = state.levels[activeLevel];
    if (currentTemp < target - state.hysteresis) return 'ON';
    if (currentTemp > target + state.hysteresis) return 'OFF';
    return state.lastCommandedState ?? 'OFF';
  }

  private async evaluate(): Promise<void> {
    const state = await this.loadState();
    if (!state.deviceId || !state.enabled) return;

    const activeOverride = this.activeOverride(state);
    // Dérogation expirée : on l'efface pour revenir proprement au planning.
    if (state.override && !activeOverride) {
      state.override = null;
      await this.saveState(state);
    }

    const activeLevel = this.computeActiveLevel(state, activeOverride);
    const currentTemp = await this.readCurrentTemp(state);
    if (currentTemp === null) {
      this.logger.warn('Chaudière : sonde de température indisponible, régulation en pause');
      return;
    }

    const desired = this.computeDesiredState(state, activeLevel, currentTemp);
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
    this.logger.log(
      `Chaudière : ${device.name} → ${desired} (niveau ${activeLevel}, cible ${state.levels[activeLevel]}°C, mesure ${currentTemp}°C)`,
    );

    state.lastCommandedState = desired;
    state.lastChangeAt = new Date(now).toISOString();
    await this.saveState(state);
  }
}
