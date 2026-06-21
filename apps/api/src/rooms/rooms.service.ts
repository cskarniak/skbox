import { Inject, Injectable } from '@nestjs/common';
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

  delete(id: string) {
    return this.prisma.room.delete({ where: { id } });
  }
}
