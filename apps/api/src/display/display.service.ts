import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '@skbox/db';
import { BoilerMode, BoilerService, LEVEL_LABELS, LevelKey } from '../boiler/boiler.service';

export interface DisplayTemperature {
  id: string;
  name: string;
  room: string | null;
  temp: number;
  humidity: number | null;
  battery: number | null;
  online: boolean;
  lastSeen: string; // "HH:MM" heure locale
}

export interface DisplayLevel {
  key: LevelKey;
  label: string;
  temp: number;
}

export interface DisplaySummary {
  generatedAt: string; // ISO
  localTime: string; // "HH:MM"
  localDate: string; // "jeu. 24 sept."
  temperatures: DisplayTemperature[];
  boiler: {
    configured: boolean;
    enabled: boolean;
    relayOnline: boolean;
    heating: boolean; // dernier ordre envoyé au relais = ON
    activeLevel: LevelKey;
    activeLabel: string;
    targetTemp: number;
    currentTemp: number | null;
    scheduleActive: boolean;
    exception: string | null; // nom de la période dérogatoire active
    override: { level: LevelKey; label: string; until: string } | null; // until = "HH:MM"
    mode: BoilerMode;
    programName: string | null;
    // day = "" (aujourd'hui), "demain" ou jour abrégé ("sam.") ; time = "HH:MM"
    next: { day: string; time: string; level: LevelKey; label: string } | null;
  };
  levels: DisplayLevel[];
}

// Fuseau des libellés d'heure : l'ESP32 n'a pas à gérer le fuseau ni l'heure d'été.
const TZ = process.env.TZ || 'Europe/Paris';

function hhmm(date: Date): string {
  return new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(date);
}

function shortDate(date: Date): string {
  return new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' }).format(date);
}

function dayKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

// "" pour aujourd'hui, "demain", sinon le jour abrégé : assez pour un horizon d'une semaine.
function relativeDay(date: Date, now: Date): string {
  if (dayKey(date) === dayKey(now)) return '';
  if (dayKey(date) === dayKey(new Date(now.getTime() + 86_400_000))) return 'demain';
  return new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, weekday: 'short' }).format(date);
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

@Injectable()
export class DisplayService {
  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly boiler: BoilerService,
  ) {}

  async getSummary(deviceIds?: string[]): Promise<DisplaySummary> {
    const now = new Date();
    const [temperatures, status, config] = await Promise.all([
      this.readTemperatures(deviceIds),
      this.boiler.getStatus(),
      this.boiler.getConfig(),
    ]);

    return {
      generatedAt: now.toISOString(),
      localTime: hhmm(now),
      localDate: shortDate(now),
      temperatures,
      boiler: {
        configured: status.deviceId !== null,
        enabled: status.enabled,
        relayOnline: status.deviceOnline,
        heating: status.commandedState === 'ON',
        activeLevel: status.activeLevel,
        activeLabel: LEVEL_LABELS[status.activeLevel],
        targetTemp: status.targetTemp,
        currentTemp: status.currentTemp,
        scheduleActive: status.scheduleActive,
        exception: status.activeDateException?.name ?? null,
        override: status.override
          ? {
              level: status.override.level,
              label: LEVEL_LABELS[status.override.level],
              until: hhmm(new Date(status.override.until)),
            }
          : null,
        mode: status.mode,
        programName: status.programName,
        next: status.nextChange
          ? {
              day: relativeDay(new Date(status.nextChange.at), now),
              time: hhmm(new Date(status.nextChange.at)),
              level: status.nextChange.level,
              label: LEVEL_LABELS[status.nextChange.level],
            }
          : null,
      },
      levels: (Object.keys(LEVEL_LABELS) as LevelKey[]).map((key) => ({
        key,
        label: LEVEL_LABELS[key],
        temp: config.levels[key],
      })),
    };
  }

  // Capteurs ayant une température numérique dans leur état (déjà corrigée de l'offset de
  // calibration à la réception). Liste explicite -> ordre de la liste ; sinon capteurs visibles
  // et actifs, triés par ordre des pièces puis par nom.
  private async readTemperatures(deviceIds?: string[]): Promise<DisplayTemperature[]> {
    const [devices, rooms] = await Promise.all([
      this.prisma.device.findMany({
        where: deviceIds ? { id: { in: deviceIds } } : { visible: true, active: true },
      }),
      this.prisma.room.findMany({ orderBy: { order: 'asc' } }),
    ]);

    const roomOrder = new Map<string, number>(rooms.map((r: { name: string }, i: number) => [r.name, i]));
    const result: DisplayTemperature[] = [];
    for (const device of devices) {
      let state: Record<string, unknown>;
      try {
        state = JSON.parse(device.state || '{}');
      } catch {
        continue;
      }
      const temp = num(state.temperature);
      if (temp === null) continue;
      result.push({
        id: device.id,
        name: device.name,
        room: device.room,
        temp,
        humidity: num(state.humidity),
        battery: num(state.battery),
        online: device.status === 'online',
        lastSeen: hhmm(device.lastSeen),
      });
    }

    if (deviceIds) {
      const position = new Map(deviceIds.map((id, i) => [id, i]));
      return result.sort((a, b) => position.get(a.id)! - position.get(b.id)!);
    }
    const rank = (room: string | null) => (room !== null && roomOrder.has(room) ? roomOrder.get(room)! : Number.MAX_SAFE_INTEGER);
    return result.sort((a, b) => rank(a.room) - rank(b.room) || a.name.localeCompare(b.name, 'fr'));
  }
}
