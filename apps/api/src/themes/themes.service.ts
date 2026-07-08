import { ConflictException, Inject, Injectable } from '@nestjs/common';
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

  async delete(id: string) {
    const theme = await this.prisma.theme.findUniqueOrThrow({
      where: { id },
      include: { _count: { select: { devices: true } } },
    });
    if (theme._count.devices > 0) {
      throw new ConflictException(
        `Impossible de supprimer : ${theme._count.devices} appareil(s) utilisent encore ce thème.`,
      );
    }
    return this.prisma.theme.delete({ where: { id } });
  }
}
