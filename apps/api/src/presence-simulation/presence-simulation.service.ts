import { Inject, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient, PresenceSimulation } from '@skbox/db';
import { CreatePresenceSimulationDto, TimeOrSolar, UpdatePresenceSimulationDto } from '@skbox/shared';
import { MqttService } from '../mqtt/mqtt.service';
import { NotificationService } from '../notifications/notification.service';
import { WeatherService } from '../weather/weather.service';
import { generateDailyPlan, PlannedEvent } from './presence-simulation.plan';

const TICK_MS = 60_000;
// Un événement encore non exécuté plus de 2 ticks après son heure prévue est considéré
// raté (ex. API redémarrée pendant la fenêtre) : on le marque en échec sans le rejouer
// tardivement, pour ne pas rallumer/éteindre une lampe hors contexte plusieurs heures après.
const MISSED_GRACE_MS = TICK_MS * 2;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function dateString(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function randomOffsetMs(min: number, max: number, rng: () => number): number {
  if (max <= min) return min * 60_000;
  return Math.floor((min + rng() * (max - min)) * 60_000);
}

@Injectable()
export class PresenceSimulationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PresenceSimulationService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private eventTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly mqtt: MqttService,
    private readonly weather: WeatherService,
    private readonly notifications: NotificationService,
  ) {}

  async onModuleInit() {
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    await this.tick();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    for (const timer of this.eventTimers.values()) clearTimeout(timer);
    this.eventTimers.clear();
  }

  // --- CRUD ---

  async findAll() {
    const profiles = await this.prisma.presenceSimulation.findMany({ orderBy: { createdAt: 'desc' } });
    return profiles.map(this.parseProfile);
  }

  async findById(id: string) {
    const profile = await this.prisma.presenceSimulation.findUnique({ where: { id } });
    if (!profile) throw new NotFoundException('Simulation de présence introuvable');
    return this.parseProfile(profile);
  }

  async create(dto: CreatePresenceSimulationDto) {
    const profile = await this.prisma.presenceSimulation.create({
      data: {
        name: dto.name,
        enabled: dto.enabled,
        lightDeviceIds: JSON.stringify(dto.lightDeviceIds),
        onTime: JSON.stringify(dto.onTime),
        offTime: JSON.stringify(dto.offTime),
        onRandomOffsetMin: dto.onRandomOffsetMin,
        onRandomOffsetMax: dto.onRandomOffsetMax,
        offRandomOffsetMin: dto.offRandomOffsetMin,
        offRandomOffsetMax: dto.offRandomOffsetMax,
        toggleCountMin: dto.toggleCountMin,
        toggleCountMax: dto.toggleCountMax,
        toggleDurationMin: dto.toggleDurationMin,
        toggleDurationMax: dto.toggleDurationMax,
      },
    });
    void this.tick();
    return this.parseProfile(profile);
  }

  async update(id: string, dto: UpdatePresenceSimulationDto) {
    const profile = await this.prisma.presenceSimulation.update({
      where: { id },
      data: this.toData(dto),
    });
    void this.tick();
    return this.parseProfile(profile);
  }

  async setEnabled(id: string, enabled: boolean) {
    const profile = await this.prisma.presenceSimulation.update({ where: { id }, data: { enabled } });
    void this.tick();
    return this.parseProfile(profile);
  }

  async delete(id: string) {
    await this.prisma.presenceSimulation.delete({ where: { id } });
  }

  async listEvents(profileId: string, from?: string, to?: string) {
    const fromDate = from ?? dateString(addDays(new Date(), -14));
    const toDate = to ?? dateString(new Date());
    const runs = await this.prisma.presenceSimulationRun.findMany({
      where: { profileId, date: { gte: fromDate, lte: toDate } },
      orderBy: { date: 'desc' },
      include: { events: { orderBy: { scheduledAt: 'asc' } } },
    });
    return runs;
  }

  private toData(dto: CreatePresenceSimulationDto | UpdatePresenceSimulationDto) {
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.enabled !== undefined) data.enabled = dto.enabled;
    if (dto.lightDeviceIds !== undefined) data.lightDeviceIds = JSON.stringify(dto.lightDeviceIds);
    if (dto.onTime !== undefined) data.onTime = JSON.stringify(dto.onTime);
    if (dto.offTime !== undefined) data.offTime = JSON.stringify(dto.offTime);
    if (dto.onRandomOffsetMin !== undefined) data.onRandomOffsetMin = dto.onRandomOffsetMin;
    if (dto.onRandomOffsetMax !== undefined) data.onRandomOffsetMax = dto.onRandomOffsetMax;
    if (dto.offRandomOffsetMin !== undefined) data.offRandomOffsetMin = dto.offRandomOffsetMin;
    if (dto.offRandomOffsetMax !== undefined) data.offRandomOffsetMax = dto.offRandomOffsetMax;
    if (dto.toggleCountMin !== undefined) data.toggleCountMin = dto.toggleCountMin;
    if (dto.toggleCountMax !== undefined) data.toggleCountMax = dto.toggleCountMax;
    if (dto.toggleDurationMin !== undefined) data.toggleDurationMin = dto.toggleDurationMin;
    if (dto.toggleDurationMax !== undefined) data.toggleDurationMax = dto.toggleDurationMax;
    return data;
  }

  private parseProfile = (profile: PresenceSimulation) => ({
    ...profile,
    lightDeviceIds: JSON.parse(profile.lightDeviceIds) as string[],
    onTime: JSON.parse(profile.onTime) as TimeOrSolar,
    offTime: JSON.parse(profile.offTime) as TimeOrSolar,
  });

  // --- Moteur ---

  private async tick() {
    try {
      const profiles = await this.prisma.presenceSimulation.findMany({ where: { enabled: true } });
      for (const profile of profiles) {
        await this.ensureRun(profile, new Date());
        await this.ensureRun(profile, addDays(new Date(), 1));
      }
      await this.catchUpAndArmTimers();
      await this.verifyCompletedRuns();
    } catch (err) {
      this.logger.error(`Erreur pendant le cycle de simulation de présence: ${err}`);
    }
  }

  private async ensureRun(profile: PresenceSimulation, forDate: Date): Promise<void> {
    const date = dateString(forDate);
    const existing = await this.prisma.presenceSimulationRun.findUnique({
      where: { profileId_date: { profileId: profile.id, date } },
    });
    if (existing) return; // génération idempotente : ne recalcule jamais un plan déjà posé

    const onTime = JSON.parse(profile.onTime) as TimeOrSolar;
    const offTime = JSON.parse(profile.offTime) as TimeOrSolar;

    const onBase = await this.resolveTime(onTime, date);
    if (!onBase) {
      this.logger.warn(`Simulation "${profile.name}": heure d'allumage non résolue pour ${date}, réessai au prochain cycle`);
      return;
    }
    let offBase = await this.resolveTime(offTime, date);
    if (!offBase) {
      this.logger.warn(`Simulation "${profile.name}": heure d'extinction non résolue pour ${date}, réessai au prochain cycle`);
      return;
    }
    // Passage minuit : l'extinction est en réalité le lendemain de l'allumage.
    if (offBase.getTime() <= onBase.getTime()) {
      offBase = new Date(offBase.getTime() + 24 * 60 * 60_000);
    }

    const rng = Math.random;
    const onAt = new Date(onBase.getTime() + randomOffsetMs(profile.onRandomOffsetMin, profile.onRandomOffsetMax, rng));
    const offAt = new Date(offBase.getTime() + randomOffsetMs(profile.offRandomOffsetMin, profile.offRandomOffsetMax, rng));
    if (offAt.getTime() <= onAt.getTime()) {
      this.logger.warn(`Simulation "${profile.name}": fenêtre on/off invalide pour ${date}, ignorée`);
      return;
    }

    const events = generateDailyPlan({
      onAt,
      offAt,
      toggleCountMin: profile.toggleCountMin,
      toggleCountMax: profile.toggleCountMax,
      toggleDurationMin: profile.toggleDurationMin,
      toggleDurationMax: profile.toggleDurationMax,
      rng,
    });

    await this.prisma.presenceSimulationRun.create({
      data: {
        profileId: profile.id,
        date,
        plannedOnAt: onAt,
        plannedOffAt: offAt,
        events: {
          create: events.map((e) => ({ kind: e.kind, action: e.action, scheduledAt: e.at })),
        },
      },
    });
    this.logger.log(`Simulation "${profile.name}": plan du ${date} généré (${events.length} événements)`);
  }

  private async resolveTime(t: TimeOrSolar, date: string): Promise<Date | null> {
    if (t.mode === 'fixed') {
      const [h, m] = t.time.split(':').map(Number);
      const [y, mo, d] = date.split('-').map(Number);
      return new Date(y, mo - 1, d, h, m, 0, 0);
    }
    const dayOffset = date === dateString(new Date()) ? 0 : 1;
    const sun = await this.weather.getSunTimes(dayOffset as 0 | 1);
    if (!sun) return null;
    const base = t.reference === 'sunrise' ? sun.sunrise : sun.sunset;
    return new Date(base.getTime() + t.offsetMinutes * 60_000);
  }

  // Réarme un timer précis pour chaque événement futur non exécuté (couvre à la fois la
  // génération fraîche d'un plan et la reprise après un redémarrage du process, qui perd
  // tous les setTimeout en mémoire), et marque en échec les événements en retard sans les
  // rejouer tardivement.
  private async catchUpAndArmTimers() {
    const pending = await this.prisma.presenceSimulationEvent.findMany({
      where: { executedAt: null },
      include: { run: { include: { profile: true } } },
    });
    const now = Date.now();
    for (const event of pending) {
      if (!event.run.profile.enabled) continue;
      const delay = event.scheduledAt.getTime() - now;
      if (delay <= -MISSED_GRACE_MS) {
        await this.prisma.presenceSimulationEvent.update({
          where: { id: event.id },
          data: { executedAt: new Date(), success: false, error: 'raté (redémarrage ou cycle manqué)' },
        });
        continue;
      }
      if (this.eventTimers.has(event.id)) continue;
      const timer = setTimeout(() => void this.executeEvent(event.id), Math.max(0, delay));
      this.eventTimers.set(event.id, timer);
    }
  }

  async executeEvent(eventId: string): Promise<void> {
    this.eventTimers.delete(eventId);
    const event = await this.prisma.presenceSimulationEvent.findUnique({
      where: { id: eventId },
      include: { run: { include: { profile: true } } },
    });
    if (!event || event.executedAt) return; // déjà traité (idempotence)

    if (!event.run.profile.enabled) {
      await this.prisma.presenceSimulationEvent.update({
        where: { id: eventId },
        data: { executedAt: new Date(), success: false, error: 'profil désactivé' },
      });
      return;
    }

    const deviceIds = JSON.parse(event.run.profile.lightDeviceIds) as string[];
    const devices = await this.prisma.device.findMany({ where: { id: { in: deviceIds } } });

    let ok = this.mqtt.isConnected;
    let error: string | null = ok ? null : 'MQTT non connecté';
    for (const device of devices) {
      if (!device.mqttTopic) continue;
      try {
        this.mqtt.publish(`${device.mqttTopic}/set`, JSON.stringify({ state: event.action }));
      } catch (err) {
        ok = false;
        error = String(err);
      }
    }

    await this.prisma.presenceSimulationEvent.update({
      where: { id: eventId },
      data: { executedAt: new Date(), success: ok, error },
    });
    this.logger.log(`Simulation "${event.run.profile.name}": ${event.kind} → ${event.action} (${ok ? 'ok' : 'échec'})`);
  }

  // --- Vérification quotidienne ---

  async verifyCompletedRuns(): Promise<void> {
    const runs = await this.prisma.presenceSimulationRun.findMany({
      where: { verifiedAt: null, plannedOffAt: { lt: new Date() } },
      include: { events: true, profile: true },
    });
    if (runs.length === 0) return;

    const lines: string[] = [];
    for (const run of runs) {
      const allDone = run.events.every((e) => e.executedAt !== null);
      if (!allDone) continue; // pas encore terminé (événement futur ou timer pas encore joué)

      const ok = run.events.every((e) => e.success === true);
      await this.prisma.presenceSimulationRun.update({
        where: { id: run.id },
        data: { verifiedAt: new Date(), verifiedOk: ok },
      });

      const failedCount = run.events.filter((e) => e.success !== true).length;
      lines.push(
        ok
          ? `✅ ${run.profile.name} (${run.date}) : ${run.events.length} événement(s), tous exécutés correctement.`
          : `⚠️ ${run.profile.name} (${run.date}) : ${failedCount}/${run.events.length} événement(s) en échec.`,
      );
    }

    if (lines.length === 0) return;
    const message = `Simulation de présence — vérification quotidienne\n\n${lines.join('\n')}`;
    await this.notifications.sendTelegram(message);
  }
}
