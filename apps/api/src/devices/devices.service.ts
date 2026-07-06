import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '@skbox/db';
import {
  CreateDeviceDto,
  UpdateDeviceDto,
  UpdateDeviceThemesDto,
  UpdateDisplayPreferencesDto,
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

    // Un capteur bavard peut dépasser `maxPoints` événements bien avant la fin de la
    // plage demandée : prendre les N derniers tronquerait silencieusement le début de
    // la période au lieu de couvrir toute la plage. On échantillonne donc un point
    // régulièrement espacé sur l'ensemble de la plage plutôt que les plus récents.
    const ids = await this.prisma.deviceEvent.findMany({
      where,
      orderBy: { timestamp: 'asc' },
      select: { id: true },
    });
    if (ids.length <= maxPoints) {
      return this.prisma.deviceEvent.findMany({ where, orderBy: { timestamp: 'asc' } });
    }

    const step = Math.ceil(ids.length / maxPoints);
    const sampledIds = ids.filter((_, i) => i % step === 0).map((e) => e.id);
    const lastId = ids[ids.length - 1].id;
    if (sampledIds[sampledIds.length - 1] !== lastId) sampledIds.push(lastId);

    const sampled = await this.prisma.deviceEvent.findMany({
      where: { id: { in: sampledIds } },
      orderBy: { timestamp: 'asc' },
    });
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
