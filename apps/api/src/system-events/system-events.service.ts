import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@skbox/db';
import * as os from 'os';

export type SystemEventService = 'zigbee' | 'rfxcom' | 'tailscale' | 'system';
export type SystemEventType =
  | 'offline'
  | 'reconnected'
  | 'auto_restart'
  | 'manual_stop'
  | 'manual_start'
  | 'manual_restart'
  | 'boot';

// Tolérance utilisée pour distinguer un vrai redémarrage machine d'un simple redémarrage
// de skbox-api (ex. après un déploiement) : l'horodatage de boot calculé à partir de
// os.uptime() ne varie que de quelques secondes entre deux lancements de l'API tant que
// la machine elle-même n'a pas redémarré.
const BOOT_DEDUPE_TOLERANCE_MS = 5 * 60_000;

@Injectable()
export class SystemEventsService implements OnModuleInit {
  private readonly logger = new Logger(SystemEventsService.name);

  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  async onModuleInit() {
    // createdAt du dernier événement "boot" représente l'heure de boot machine estimée
    // (voir plus bas), pas l'heure à laquelle l'API a démarré — les deux ne coïncident
    // que pour le tout premier lancement suivant un redémarrage réel.
    const approxBootAt = new Date(Date.now() - os.uptime() * 1000);
    const lastBoot = await this.prisma.serviceEvent.findFirst({
      where: { service: 'system', event: 'boot' },
      orderBy: { createdAt: 'desc' },
    });

    if (lastBoot && Math.abs(lastBoot.createdAt.getTime() - approxBootAt.getTime()) < BOOT_DEDUPE_TOLERANCE_MS) {
      return;
    }

    await this.prisma.serviceEvent.create({
      data: {
        service: 'system',
        event: 'boot',
        detail: `uptime au démarrage de l'API : ${Math.round(os.uptime())}s`,
        createdAt: approxBootAt,
      },
    });
    this.logger.log('Nouveau démarrage machine détecté et journalisé');
  }

  async log(service: SystemEventService, event: SystemEventType, detail?: string): Promise<void> {
    await this.prisma.serviceEvent.create({ data: { service, event, detail } });
  }

  async list(limit = 100) {
    return this.prisma.serviceEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 500),
    });
  }
}
