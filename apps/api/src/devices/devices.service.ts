import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '@skbox/db';
import { CreateDeviceDto, UpdateDeviceDto, UpdateDeviceThemesDto } from '@skbox/shared';

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

  async getHistory(id: string, limit: number, from?: Date, to?: Date) {
    const events = await this.prisma.deviceEvent.findMany({
      where: {
        deviceId: id,
        event: 'state_update',
        timestamp: from || to ? { gte: from, lte: to } : undefined,
      },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
    return events.reverse();
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
