import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@skbox/db';

interface CameraConnectionDto {
  host: string;
  port?: number;
  path?: string;
  username?: string | null;
  password?: string | null;
}

interface CreateCameraDto extends CameraConnectionDto {
  name: string;
  room?: string | null;
}

interface UpdateCameraDto extends Partial<CameraConnectionDto> {
  name?: string;
  room?: string | null;
  active?: boolean;
  order?: number;
}

@Injectable()
export class CameraService implements OnModuleInit {
  private readonly logger = new Logger(CameraService.name);

  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly config: ConfigService,
  ) {}

  private get go2rtcUrl(): string {
    return this.config.get('GO2RTC_URL', 'http://localhost:1984');
  }

  // go2rtc ne persiste pas les flux enregistrés via son API — au redémarrage de
  // go2rtc (ou de l'API), on lui réinjecte donc toutes les caméras actives, la base
  // Skbox restant la seule source de vérité pour la configuration des caméras.
  async onModuleInit() {
    const cameras = await this.prisma.camera.findMany({ where: { active: true } });
    for (const camera of cameras) {
      await this.syncStream(camera.id, this.buildRtspUrl(camera));
    }
  }

  async findAll() {
    return this.prisma.camera.findMany({ orderBy: { order: 'asc' } });
  }

  async create(data: CreateCameraDto) {
    const camera = await this.prisma.camera.create({ data });
    await this.syncStream(camera.id, this.buildRtspUrl(camera));
    return camera;
  }

  async update(id: string, data: UpdateCameraDto) {
    const camera = await this.prisma.camera.update({ where: { id }, data });
    if (camera.active) {
      await this.syncStream(camera.id, this.buildRtspUrl(camera));
    } else {
      await this.removeStream(camera.id);
    }
    return camera;
  }

  async remove(id: string) {
    await this.removeStream(id);
    await this.prisma.camera.delete({ where: { id } });
  }

  async getSnapshot(id: string): Promise<Buffer> {
    const camera = await this.prisma.camera.findUnique({ where: { id } });
    if (!camera) throw new Error('Caméra introuvable');

    const res = await fetch(`${this.go2rtcUrl}/api/frame.jpeg?src=${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error(`go2rtc a répondu ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  private buildRtspUrl(camera: {
    host: string;
    port: number;
    path: string;
    username?: string | null;
    password?: string | null;
  }): string {
    const auth = camera.username
      ? `${encodeURIComponent(camera.username)}${camera.password ? `:${encodeURIComponent(camera.password)}` : ''}@`
      : '';
    const path = camera.path && !camera.path.startsWith('/') ? `/${camera.path}` : camera.path;
    return `rtsp://${auth}${camera.host}:${camera.port}${path}`;
  }

  private async syncStream(id: string, rtspUrl: string) {
    try {
      const url = `${this.go2rtcUrl}/api/streams?name=${encodeURIComponent(id)}&src=${encodeURIComponent(rtspUrl)}`;
      const res = await fetch(url, { method: 'PUT' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err: any) {
      this.logger.error(`Échec de l'enregistrement du flux go2rtc pour ${id}: ${err?.message}`);
    }
  }

  private async removeStream(id: string) {
    try {
      const res = await fetch(`${this.go2rtcUrl}/api/streams?src=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`);
    } catch (err: any) {
      this.logger.error(`Échec de la suppression du flux go2rtc pour ${id}: ${err?.message}`);
    }
  }
}
