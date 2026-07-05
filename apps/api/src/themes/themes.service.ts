import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '@skbox/db';
import { CreateThemeDto, UpdateThemeDto } from '@skbox/shared';

@Injectable()
export class ThemesService {
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  findAll() {
    return this.prisma.theme.findMany({
      orderBy: { order: 'asc' },
      include: { devices: true },
    });
  }

  create(dto: CreateThemeDto) {
    return this.prisma.theme.create({ data: dto });
  }

  update(id: string, dto: UpdateThemeDto) {
    return this.prisma.theme.update({ where: { id }, data: dto });
  }

  delete(id: string) {
    return this.prisma.theme.delete({ where: { id } });
  }
}
