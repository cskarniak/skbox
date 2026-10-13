import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '@skbox/db';
import { computeDailyEnergy, DailyEnergy, energyWindowStart, MeterSample } from './energy-consumption';
import { AvailabilityDrop, classifyOutages, computePowerRuns, OUTAGE_MIN_MINUTES, PowerOutage, PowerReading } from './power-outages';

export interface ElectricityHistory {
  deviceId: string | null;
  deviceName: string | null;
  currentPowerW: number | null;
  days: DailyEnergy[];
}

export interface PowerOutageHistory {
  deviceId: string | null;
  deviceName: string | null;
  minDurationMinutes: number;
  totalMinutes: number;
  discardedParasites: number; // séries à 0 W écartées : les appareils sur secteur sont restés actifs
  trackingSince: string | null; // début de l'enregistrement des disponibilités (corroboration possible après)
  outages: PowerOutage[]; // de la plus récente à la plus ancienne
}

function parse(data: string): { energy: number | null; power: number | null } {
  try {
    const d = JSON.parse(data);
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    return { energy: num(d.energy), power: num(d.power) };
  } catch {
    return { energy: null, power: null };
  }
}

@Injectable()
export class EnergyService {
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  // Compteur électrique : le capteur de puissance (type sensor_power) qui expose un compteur
  // d'énergie cumulé. Un seul compteur est géré pour l'instant (celui du tableau).
  private async findMeter() {
    const candidates = await this.prisma.device.findMany({
      where: { type: 'sensor_power', active: true },
      orderBy: { name: 'asc' },
    });
    return candidates.find((d) => parse(d.state).energy !== null) ?? candidates[0] ?? null;
  }

  async getElectricityDaily(days: number): Promise<ElectricityHistory> {
    const span = Math.min(Math.max(Math.floor(days) || 14, 1), 365);
    const meter = await this.findMeter();
    if (!meter) return { deviceId: null, deviceName: null, currentPowerW: null, days: [] };

    const now = new Date();
    const windowStart = energyWindowStart(now, span);
    const [before, inWindow] = await Promise.all([
      this.prisma.deviceEvent.findFirst({
        where: { deviceId: meter.id, event: 'state_update', timestamp: { lt: windowStart }, data: { contains: '"energy"' } },
        orderBy: { timestamp: 'desc' },
      }),
      this.prisma.deviceEvent.findMany({
        where: { deviceId: meter.id, event: 'state_update', timestamp: { gte: windowStart } },
        orderBy: { timestamp: 'asc' },
      }),
    ]);

    const samples: MeterSample[] = [];
    for (const e of before ? [before, ...inWindow] : inWindow) {
      const { energy, power } = parse(e.data);
      samples.push({ timestamp: e.timestamp, energyWh: energy, powerW: power });
    }

    const current = parse(meter.state).power;
    return {
      deviceId: meter.id,
      deviceName: meter.name,
      currentPowerW: current !== null && current >= 0 && current <= 30_000 ? Math.round(current) : null,
      days: computeDailyEnergy(samples, span, now),
    };
  }

  // Coupures de courant reconstituées depuis l'historique du compteur : l'historique n'enregistre qu'un
  // changement de plus de 20 W, donc un 0 W stable n'écrit rien jusqu'au retour du courant. On repère
  // les relevés à 0 W de la période, puis les relevés qui les suivent pour trouver la fin de la coupure.
  async getPowerOutages(days: number): Promise<PowerOutageHistory> {
    const span = Math.min(Math.max(Math.floor(days) || 90, 1), 365);
    const meter = await this.findMeter();
    const empty = {
      minDurationMinutes: OUTAGE_MIN_MINUTES,
      totalMinutes: 0,
      discardedParasites: 0,
      trackingSince: null as string | null,
      outages: [] as PowerOutage[],
    };
    if (!meter) return { deviceId: null, deviceName: null, ...empty };

    const now = new Date();
    const windowStart = energyWindowStart(now, span);
    const zeros = await this.prisma.deviceEvent.findMany({
      where: {
        deviceId: meter.id,
        event: 'state_update',
        timestamp: { gte: windowStart },
        OR: [{ data: { contains: '"power":0,' } }, { data: { contains: '"power":0}' } }],
      },
      orderBy: { timestamp: 'asc' },
    });

    const byTime = new Map<number, PowerReading>();
    for (const z of zeros) {
      if (parse(z.data).power !== 0) continue;
      byTime.set(z.timestamp.getTime(), { timestamp: z.timestamp, powerW: 0 });
      const following = await this.prisma.deviceEvent.findMany({
        where: { deviceId: meter.id, event: 'state_update', timestamp: { gt: z.timestamp } },
        orderBy: { timestamp: 'asc' },
        take: 6,
      });
      for (const f of following) byTime.set(f.timestamp.getTime(), { timestamp: f.timestamp, powerW: parse(f.data).power });
    }

    // Une coupure en cours n'a pas de relevé suivant : on s'assure que le dernier relevé connu est bien 0 W.
    const current = parse(meter.state).power;
    const readings = [...byTime.values()];
    if (current !== null && current > 5) readings.push({ timestamp: meter.lastSeen, powerW: current });

    // Corroboration : les appareils Zigbee branchés sur le secteur (prises, lampes) deviennent muets
    // pendant une vraie coupure, pas pendant un parasite radio du compteur. Le relais de la chaudière,
    // sur onduleur, reste actif et ne sert donc pas de repère.
    const boilerRelayId = await this.boilerRelayId();
    const mains = (
      await this.prisma.device.findMany({
        where: { protocol: 'zigbee', type: { in: ['switch', 'light'] }, active: true },
        select: { id: true, name: true },
      })
    ).filter((d) => d.id !== boilerRelayId);
    const names = new Map(mains.map((d) => [d.id, d.name]));

    const dropEvents = await this.prisma.deviceEvent.findMany({
      where: {
        event: 'availability',
        deviceId: { in: mains.map((d) => d.id) },
        timestamp: { gte: new Date(windowStart.getTime() - 3_600_000) },
        data: { contains: '"offline"' },
      },
      orderBy: { timestamp: 'asc' },
    });
    const drops: AvailabilityDrop[] = dropEvents.map((e) => ({ deviceName: names.get(e.deviceId) ?? e.deviceId, at: e.timestamp }));
    const first = await this.prisma.deviceEvent.findFirst({ where: { event: 'availability' }, orderBy: { timestamp: 'asc' } });

    const { outages, discarded } = classifyOutages(computePowerRuns(readings), drops, first?.timestamp ?? null, now);
    outages.reverse();
    return {
      deviceId: meter.id,
      deviceName: meter.name,
      minDurationMinutes: OUTAGE_MIN_MINUTES,
      totalMinutes: Math.round(outages.reduce((sum, o) => sum + o.durationMinutes, 0) * 10) / 10,
      discardedParasites: discarded,
      trackingSince: first ? first.timestamp.toISOString() : null,
      outages,
    };
  }

  private async boilerRelayId(): Promise<string | null> {
    try {
      const row = await this.prisma.setting.findUnique({ where: { key: 'boiler' } });
      return row ? (JSON.parse(row.value).deviceId ?? null) : null;
    } catch {
      return null;
    }
  }
}
