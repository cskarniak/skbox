import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '@skbox/db';
import { computeDailyEnergy, DailyEnergy, energyWindowStart, MeterSample } from './energy-consumption';

export interface ElectricityHistory {
  deviceId: string | null;
  deviceName: string | null;
  currentPowerW: number | null;
  days: DailyEnergy[];
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
}
