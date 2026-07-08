import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@skbox/db';
import { OnvifClient, OnvifImagingSettings } from './onvif-client';
import { ReolinkClient } from './reolink-client';

interface CameraConnectionDto {
  host: string;
  port?: number;
  path?: string;
  username?: string | null;
  password?: string | null;
  onvifPort?: number | null;
  imagingApi?: string;
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
  // Le login CGI Reolink est limité en nombre de sessions simultanées ; on réutilise le même
  // client (et son token) tant que la caméra n'est pas modifiée, au lieu de se reconnecter à
  // chaque requête d'imaging.
  private readonly reolinkClients = new Map<string, ReolinkClient>();

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
    this.reolinkClients.delete(id);
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

  async ptzMove(id: string, x: number, y: number, zoom: number) {
    await (await this.getOnvifClient(id)).continuousMove(x, y, zoom);
  }

  async ptzStop(id: string) {
    await (await this.getOnvifClient(id)).stop();
  }

  async listPresets(id: string) {
    return (await this.getOnvifClient(id)).getPresets();
  }

  async gotoPreset(id: string, token: string) {
    await (await this.getOnvifClient(id)).gotoPreset(token);
  }

  async savePreset(id: string, name: string, token?: string) {
    return (await this.getOnvifClient(id)).setPreset(name, token);
  }

  async removePreset(id: string, token: string) {
    await (await this.getOnvifClient(id)).removePreset(token);
  }

  async getImagingSettings(id: string) {
    return (await this.getImagingClient(id)).getImagingSettings();
  }

  async getImagingOptions(id: string) {
    return (await this.getImagingClient(id)).getImagingOptions();
  }

  async setImagingSettings(id: string, settings: OnvifImagingSettings) {
    await (await this.getImagingClient(id)).setImagingSettings(settings);
  }

  async listImagingProfiles(cameraId: string) {
    return this.prisma.cameraImagingProfile.findMany({ where: { cameraId }, orderBy: { createdAt: 'asc' } });
  }

  async saveImagingProfile(cameraId: string, name: string) {
    const settings = await this.getImagingSettings(cameraId);
    return this.prisma.cameraImagingProfile.create({
      data: { cameraId, name, ...settings },
    });
  }

  async applyImagingProfile(cameraId: string, profileId: string) {
    const profile = await this.prisma.cameraImagingProfile.findUnique({ where: { id: profileId } });
    if (!profile || profile.cameraId !== cameraId) throw new Error('Profil introuvable');
    await this.setImagingSettings(cameraId, {
      brightness: profile.brightness ?? undefined,
      contrast: profile.contrast ?? undefined,
      saturation: profile.saturation ?? undefined,
      sharpness: profile.sharpness ?? undefined,
    });
    return profile;
  }

  async removeImagingProfile(cameraId: string, profileId: string) {
    const profile = await this.prisma.cameraImagingProfile.findUnique({ where: { id: profileId } });
    if (!profile || profile.cameraId !== cameraId) throw new Error('Profil introuvable');
    await this.prisma.cameraImagingProfile.delete({ where: { id: profileId } });
  }

  private async getImagingClient(id: string): Promise<OnvifClient | ReolinkClient> {
    const camera = await this.prisma.camera.findUnique({ where: { id } });
    if (!camera) throw new Error('Caméra introuvable');
    if (camera.imagingApi === 'reolink') {
      let client = this.reolinkClients.get(id);
      if (!client) {
        client = new ReolinkClient(camera.host, 443, camera.username ?? '', camera.password ?? '');
        this.reolinkClients.set(id, client);
      }
      return client;
    }
    return this.getOnvifClient(id, camera);
  }

  private async getOnvifClient(id: string, preloaded?: { host: string; onvifPort: number | null; username: string | null; password: string | null }): Promise<OnvifClient> {
    const camera = preloaded ?? (await this.prisma.camera.findUnique({ where: { id } }));
    if (!camera) throw new Error('Caméra introuvable');
    if (!camera.onvifPort) throw new Error("Cette caméra n'a pas de port ONVIF configuré");
    return new OnvifClient(camera.host, camera.onvifPort, camera.username ?? '', camera.password ?? '');
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
