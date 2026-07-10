import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '@skbox/db';

@Injectable()
export class ScenarioGroupsService {
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  async findAll() {
    const groups = await this.prisma.scenarioGroup.findMany({ orderBy: { name: 'asc' } });
    const counts = await this.prisma.scenario.groupBy({
      by: ['group'],
      _count: { group: true },
      where: { group: { not: null } },
    });
    const countByName = new Map(counts.map((c) => [c.group, c._count.group]));
    return groups.map((g) => ({ ...g, scenarioCount: countByName.get(g.name) ?? 0 }));
  }

  create(name: string) {
    return this.prisma.scenarioGroup.create({ data: { name } });
  }

  async update(id: string, name: string) {
    const group = await this.prisma.scenarioGroup.findUniqueOrThrow({ where: { id } });
    return this.prisma.$transaction(async (tx) => {
      if (name !== group.name) {
        await tx.scenario.updateMany({ where: { group: group.name }, data: { group: name } });
      }
      return tx.scenarioGroup.update({ where: { id }, data: { name } });
    });
  }

  async delete(id: string) {
    const group = await this.prisma.scenarioGroup.findUniqueOrThrow({ where: { id } });
    const count = await this.prisma.scenario.count({ where: { group: group.name } });
    if (count > 0) {
      throw new ConflictException(`Impossible de supprimer : ${count} scénario(s) utilisent encore ce groupe.`);
    }
    return this.prisma.scenarioGroup.delete({ where: { id } });
  }
}
