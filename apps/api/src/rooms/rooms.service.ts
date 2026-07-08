import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '@skbox/db';

@Injectable()
export class RoomsService {
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  findAll() {
    return this.prisma.room.findMany({ orderBy: { order: 'asc' } });
  }

  create(name: string, icon?: string) {
    return this.prisma.room.create({ data: { name, icon } });
  }

  async update(id: string, name?: string, icon?: string) {
    const room = await this.prisma.room.findUniqueOrThrow({ where: { id } });
    return this.prisma.$transaction(async (tx) => {
      if (name && name !== room.name) {
        await tx.device.updateMany({ where: { room: room.name }, data: { room: name } });
      }
      return tx.room.update({ where: { id }, data: { name, icon } });
    });
  }

  async delete(id: string) {
    const room = await this.prisma.room.findUniqueOrThrow({ where: { id } });
    const count = await this.prisma.device.count({ where: { room: room.name } });
    if (count > 0) {
      throw new ConflictException(`Impossible de supprimer : ${count} appareil(s) utilisent encore cette pièce.`);
    }
    return this.prisma.room.delete({ where: { id } });
  }
}
