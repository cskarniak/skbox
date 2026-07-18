import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaClient } from '@skbox/db';
import { SettingsService } from '../settings/settings.service';
import { hasSignificantChange } from '../devices/history-change.util';

// Netatmo n'exige pas d'endpoint public accessible : l'utilisateur autorise Skbox depuis son
// navigateur, Netatmo redirige vers cette URL avec ?code=... dans la barre d'adresse (la page
// elle-même n'a pas besoin de répondre), et l'utilisateur colle ce code dans les paramètres
// Skbox. Doit correspondre exactement à l'URI enregistrée sur dev.netatmo.com.
const REDIRECT_URI = 'http://localhost/';
const SCOPE = 'read_thermostat';
const CONFIG_KEY = 'netatmo.config';
const TICK_MS = 5 * 60_000;
const TOKEN_REFRESH_MARGIN_MS = 5 * 60_000;
const NATHERM_MODULE_TYPE = 'NATherm1';

interface NetatmoConfig {
  clientId: string | null;
  clientSecret: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  accessTokenExpiresAt: string | null; // ISO
  homeId: string | null;
  roomId: string | null;
  roomName: string | null;
  deviceId: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
}

const DEFAULT_CONFIG: NetatmoConfig = {
  clientId: null,
  clientSecret: null,
  accessToken: null,
  refreshToken: null,
  accessTokenExpiresAt: null,
  homeId: null,
  roomId: null,
  roomName: null,
  deviceId: null,
  lastSyncAt: null,
  lastError: null,
};

export interface NetatmoStatus {
  configured: boolean; // client_id/secret enregistrés
  connected: boolean; // tokens valides
  roomName: string | null;
  deviceId: string | null;
  temperature: number | null;
  setpoint: number | null;
  lastSyncAt: string | null;
  lastError: string | null;
}

@Injectable()
export class NetatmoService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NetatmoService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly settings: SettingsService,
  ) {}

  async onModuleInit() {
    this.timer = setInterval(() => void this.poll(), TICK_MS);
    await this.poll();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async loadConfig(): Promise<NetatmoConfig> {
    const raw = await this.settings.get(CONFIG_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    try {
      return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    } catch {
      return { ...DEFAULT_CONFIG };
    }
  }

  private async saveConfig(config: NetatmoConfig): Promise<void> {
    await this.settings.set(CONFIG_KEY, JSON.stringify(config));
  }

  async saveCredentials(clientId: string, clientSecret: string): Promise<void> {
    const config = await this.loadConfig();
    await this.saveConfig({ ...config, clientId, clientSecret });
  }

  async getAuthorizeUrl(): Promise<string> {
    const config = await this.loadConfig();
    if (!config.clientId) {
      throw new BadRequestException("Identifiants Netatmo non configurés (client_id manquant)");
    }
    const url = new URL('https://api.netatmo.com/oauth2/authorize');
    url.searchParams.set('client_id', config.clientId);
    url.searchParams.set('redirect_uri', REDIRECT_URI);
    url.searchParams.set('scope', SCOPE);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('state', 'skbox');
    return url.toString();
  }

  async connect(code: string): Promise<NetatmoStatus> {
    const config = await this.loadConfig();
    if (!config.clientId || !config.clientSecret) {
      throw new BadRequestException('Identifiants Netatmo non configurés');
    }

    const tokens = await this.requestTokens({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: REDIRECT_URI,
      scope: SCOPE,
    });

    let next: NetatmoConfig = {
      ...config,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      lastError: null,
    };
    await this.saveConfig(next);

    const room = await this.discoverThermostatRoom(tokens.access_token);
    next = { ...next, homeId: room.homeId, roomId: room.roomId, roomName: room.roomName };
    await this.saveConfig(next);

    await this.ensureDevice(next);
    await this.poll();
    return this.getStatus();
  }

  async disconnect(): Promise<NetatmoStatus> {
    const config = await this.loadConfig();
    await this.saveConfig({
      ...config,
      accessToken: null,
      refreshToken: null,
      accessTokenExpiresAt: null,
      homeId: null,
      roomId: null,
      roomName: null,
      lastError: null,
    });
    return this.getStatus();
  }

  async getStatus(): Promise<NetatmoStatus> {
    const config = await this.loadConfig();
    let temperature: number | null = null;
    let setpoint: number | null = null;
    if (config.deviceId) {
      const device = await this.prisma.device.findUnique({ where: { id: config.deviceId } });
      if (device) {
        const state = JSON.parse(device.state || '{}');
        temperature = typeof state.temperature === 'number' ? state.temperature : null;
        setpoint = typeof state.setpoint === 'number' ? state.setpoint : null;
      }
    }
    return {
      configured: !!config.clientId && !!config.clientSecret,
      connected: !!config.refreshToken,
      roomName: config.roomName,
      deviceId: config.deviceId,
      temperature,
      setpoint,
      lastSyncAt: config.lastSyncAt,
      lastError: config.lastError,
    };
  }

  async syncNow(): Promise<NetatmoStatus> {
    await this.poll();
    return this.getStatus();
  }

  private async ensureAccessToken(config: NetatmoConfig): Promise<{ accessToken: string; config: NetatmoConfig }> {
    if (!config.refreshToken || !config.clientId || !config.clientSecret) {
      throw new BadRequestException('Netatmo non connecté');
    }
    const expiresAt = config.accessTokenExpiresAt ? new Date(config.accessTokenExpiresAt).getTime() : 0;
    if (config.accessToken && expiresAt - Date.now() > TOKEN_REFRESH_MARGIN_MS) {
      return { accessToken: config.accessToken, config };
    }

    // Netatmo fait tourner le refresh_token à chaque utilisation : le précédent devient
    // invalide, il faut impérativement persister le nouveau à chaque rafraîchissement.
    const tokens = await this.requestTokens({
      grant_type: 'refresh_token',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
    });
    const next: NetatmoConfig = {
      ...config,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    };
    await this.saveConfig(next);
    return { accessToken: tokens.access_token, config: next };
  }

  private async poll(): Promise<void> {
    let config = await this.loadConfig();
    if (!config.refreshToken || !config.roomId || !config.homeId) return; // pas encore connecté
    const homeId = config.homeId;

    try {
      const ensured = await this.ensureAccessToken(config);
      config = ensured.config;

      const status = await this.fetchJson(
        `https://api.netatmo.com/api/homestatus?home_id=${encodeURIComponent(homeId)}`,
        { headers: { Authorization: `Bearer ${ensured.accessToken}` } },
      );
      const home = status.body?.home;
      const room = (home?.rooms ?? []).find((r: any) => r.id === config.roomId);
      if (!room) {
        throw new Error('Pièce Netatmo introuvable dans homestatus');
      }

      const nextState = {
        temperature: typeof room.therm_measured_temperature === 'number' ? room.therm_measured_temperature : null,
        setpoint: typeof room.therm_setpoint_temperature === 'number' ? room.therm_setpoint_temperature : null,
      };
      const reachable = room.reachable !== false;

      await this.applyDeviceState(config, nextState, reachable);

      await this.saveConfig({ ...config, lastSyncAt: new Date().toISOString(), lastError: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Sondage Netatmo en échec: ${message}`);
      await this.saveConfig({ ...config, lastError: message });
    }
  }

  private async applyDeviceState(
    config: NetatmoConfig,
    nextState: { temperature: number | null; setpoint: number | null },
    reachable: boolean,
  ): Promise<void> {
    if (!config.deviceId) return;
    const device = await this.prisma.device.findUnique({ where: { id: config.deviceId } });
    if (!device) return;

    const { count } = await this.prisma.device.updateMany({
      where: { id: device.id, state: device.state },
      data: {
        state: JSON.stringify(nextState),
        status: reachable ? 'online' : 'offline',
        lastSeen: new Date(),
      },
    });
    if (count === 0) return; // état déjà mis à jour entre-temps (poll manuel + tick concurrents)

    if (device.trackHistory && hasSignificantChange(device.state, nextState, device.historyFieldConfig)) {
      await this.prisma.deviceEvent.create({
        data: { deviceId: device.id, event: 'state_update', data: JSON.stringify(nextState) },
      });
    }
  }

  private async discoverThermostatRoom(accessToken: string): Promise<{ homeId: string; roomId: string; roomName: string | null }> {
    const res = await this.fetchJson('https://api.netatmo.com/api/homesdata', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const homes = res.body?.homes ?? [];
    for (const home of homes) {
      const thermostatModule = (home.modules ?? []).find((m: any) => m.type === NATHERM_MODULE_TYPE);
      if (!thermostatModule) continue;
      const room = (home.rooms ?? []).find((r: any) => r.id === thermostatModule.room_id);
      return {
        homeId: home.id,
        roomId: thermostatModule.room_id,
        roomName: room?.name ?? null, // ensureDevice() retombe sur un nom générique si absent
      };
    }
    throw new BadRequestException('Aucun thermostat Netatmo (NATherm1) trouvé sur ce compte');
  }

  private async ensureDevice(config: NetatmoConfig): Promise<void> {
    if (config.deviceId) {
      const existing = await this.prisma.device.findUnique({ where: { id: config.deviceId } });
      if (existing) return;
    }
    const device = await this.prisma.device.create({
      data: {
        name: config.roomName ? `Thermostat ${config.roomName}` : 'Thermostat Netatmo',
        protocol: 'netatmo',
        type: 'sensor_temperature',
        state: '{}',
        mqttTopic: null,
        trackHistory: true,
      },
    });
    await this.saveConfig({ ...config, deviceId: device.id });
  }

  private async requestTokens(params: Record<string, string>): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
    const form = new URLSearchParams(params);
    const res = await this.fetchJson('https://api.netatmo.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    if (!res.access_token || !res.refresh_token) {
      throw new BadRequestException("Réponse Netatmo invalide lors de l'échange de jeton");
    }
    return { access_token: res.access_token, refresh_token: res.refresh_token, expires_in: Number(res.expires_in ?? 10800) };
  }

  private async fetchJson(url: string, init?: RequestInit): Promise<any> {
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch {
      throw new ServiceUnavailableException('Impossible de contacter l’API Netatmo');
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new ServiceUnavailableException(`Netatmo a répondu une erreur (${res.status}): ${body.slice(0, 200)}`);
    }
    return res.json();
  }
}
