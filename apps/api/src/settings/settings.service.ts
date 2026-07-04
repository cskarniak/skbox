import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '@skbox/db';

@Injectable()
export class SettingsService {
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  async get(key: string): Promise<string | null> {
    const setting = await this.prisma.setting.findUnique({ where: { key } });
    return setting?.value ?? null;
  }

  async set(key: string, value: string) {
    return this.prisma.setting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }
}
