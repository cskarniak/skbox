import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '@skbox/db';
import {
  CreateDeviceDto,
  UpdateDeviceDto,
  UpdateDeviceThemesDto,
  UpdateDisplayPreferencesDto,
  UpdateHistoryFieldConfigDto,
} from '@skbox/shared';

@Injectable()
export class DevicesService {
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  findAll() {
    return this.prisma.device.findMany({
      orderBy: { name: 'asc' },
    });
  }

  findById(id: string) {
    return this.prisma.device.findUniqueOrThrow({ where: { id } });
  }

  findByRoom(room: string) {
    return this.prisma.device.findMany({
      where: { room },
      orderBy: { name: 'asc' },
    });
  }

  create(dto: CreateDeviceDto) {
    return this.prisma.device.create({
      data: {
        name: dto.name,
        protocol: dto.protocol,
        type: dto.type,
        room: dto.room,
      },
    });
  }

  update(id: string, dto: UpdateDeviceDto) {
    return this.prisma.device.update({
      where: { id },
      data: dto,
    });
  }

  updateThemes(id: string, dto: UpdateDeviceThemesDto) {
    return this.prisma.device.update({
      where: { id },
      data: { themes: { set: dto.themeIds.map((themeId) => ({ id: themeId })) } },
      include: { themes: true },
    });
  }

  updateDisplayPreferences(id: string, preferences: UpdateDisplayPreferencesDto) {
    return this.prisma.device.update({
      where: { id },
      data: { displayPreferences: JSON.stringify(preferences) },
    });
  }

  updateHistoryFieldConfig(id: string, config: UpdateHistoryFieldConfigDto) {
    return this.prisma.device.update({
      where: { id },
      data: { historyFieldConfig: JSON.stringify(config) },
    });
  }

  async getHistory(id: string, limit: number, from?: Date, to?: Date, maxPoints?: number) {
    const where = {
      deviceId: id,
      event: 'state_update',
      timestamp: from || to ? { gte: from, lte: to } : undefined,
    };

    if (!maxPoints) {
      const events = await this.prisma.deviceEvent.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: limit,
      });
      return events.reverse();
    }

    const events = await this.prisma.deviceEvent.findMany({ where, orderBy: { timestamp: 'asc' } });
    if (events.length <= maxPoints) return events;

    // Échantillonnage par fenêtre de temps (et non par rang de ligne) : une rafale
    // d'anciens événements bavards (ex. un capteur qui loggait trop avant réglage du
    // filtre de bruit) ne doit pas gonfler le nombre total au point de décaler le pas
    // et de faire sauter une transition récente mais isolée (ex. un interrupteur qui
    // change d'état une seule fois dans la journée). Chaque fenêtre de temps garde son
    // propre représentant (le plus récent événement qu'elle contient), donc une
    // période creuse ne peut jamais être totalement éclipsée par une période dense.
    const startMs = events[0].timestamp.getTime();
    const endMs = events[events.length - 1].timestamp.getTime();
    const bucketMs = Math.max(1, (endMs - startMs) / maxPoints);

    const sampled: typeof events = [];
    let lastBucket = -1;
    for (const event of events) {
      const bucket = Math.floor((event.timestamp.getTime() - startMs) / bucketMs);
      if (bucket !== lastBucket) {
        sampled.push(event);
        lastBucket = bucket;
      } else {
        sampled[sampled.length - 1] = event;
      }
    }
    return sampled;
  }

  clearHistory(id: string) {
    return this.prisma.deviceEvent.deleteMany({
      where: { deviceId: id, event: 'state_update' },
    });
  }

  updateState(id: string, state: Record<string, unknown>) {
    return this.prisma.device.update({
      where: { id },
      data: {
        state: JSON.stringify(state),
        lastSeen: new Date(),
        status: 'online',
      },
    });
  }

  delete(id: string) {
    return this.prisma.device.delete({ where: { id } });
  }
}
