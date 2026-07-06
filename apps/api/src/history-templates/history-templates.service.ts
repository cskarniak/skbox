import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '@skbox/db';
import { CreateHistoryTemplateDto, UpdateHistoryTemplateDto } from '@skbox/shared';

@Injectable()
export class HistoryTemplatesService {
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  findAll() {
    return this.prisma.historyTemplate.findMany({
      orderBy: { name: 'asc' },
    });
  }

  create(dto: CreateHistoryTemplateDto) {
    return this.prisma.historyTemplate.create({
      data: { name: dto.name, panels: JSON.stringify(dto.panels) },
    });
  }

  update(id: string, dto: UpdateHistoryTemplateDto) {
    return this.prisma.historyTemplate.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.panels !== undefined ? { panels: JSON.stringify(dto.panels) } : {}),
      },
    });
  }

  delete(id: string) {
    return this.prisma.historyTemplate.delete({ where: { id } });
  }
}
