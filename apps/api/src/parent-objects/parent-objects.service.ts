import { Inject, Injectable } from '@nestjs/common';
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

  delete(id: string) {
    return this.prisma.parentObject.delete({ where: { id } });
  }
}
