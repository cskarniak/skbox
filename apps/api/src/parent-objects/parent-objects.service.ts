import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '@skbox/db';

@Injectable()
export class ParentObjectsService {
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  findAll() {
    return this.prisma.parentObject.findMany({ orderBy: { order: 'asc' } });
  }

  create(name: string, icon?: string) {
    return this.prisma.parentObject.create({ data: { name, icon } });
  }

  async update(id: string, name?: string, icon?: string) {
    const parentObject = await this.prisma.parentObject.findUniqueOrThrow({ where: { id } });
    return this.prisma.$transaction(async (tx) => {
      if (name && name !== parentObject.name) {
        await tx.device.updateMany({ where: { parentObject: parentObject.name }, data: { parentObject: name } });
      }
      return tx.parentObject.update({ where: { id }, data: { name, icon } });
    });
  }

  async delete(id: string) {
    const parentObject = await this.prisma.parentObject.findUniqueOrThrow({ where: { id } });
    const count = await this.prisma.device.count({ where: { parentObject: parentObject.name } });
    if (count > 0) {
      throw new ConflictException(`Impossible de supprimer : ${count} appareil(s) utilisent encore cet objet.`);
    }
    return this.prisma.parentObject.delete({ where: { id } });
  }
}
