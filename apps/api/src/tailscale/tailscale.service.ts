import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';
import { SettingsService } from '../settings/settings.service';
import { SystemEventsService } from '../system-events/system-events.service';

const execAsync = promisify(exec);

const DEFAULT_HEALTHCHECK_INTERVAL_SEC = 60;
// Délai minimal entre deux relances automatiques du service systemd : évite une boucle
// de redémarrages si tailscaled reste indisponible pour une raison qu'un restart ne
// résout pas (ex. panne réseau côté serveur).
const MIN_AUTO_RESTART_INTERVAL_MS = 10 * 60_000;

export interface TailscaleStatus {
  running: boolean;
  connected: boolean;
  backendState: string | null;
  tailscaleIPs: string[];
  lastCheckAt: string | null;
}

@Injectable()
export class TailscaleService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TailscaleService.name);
  private healthcheckTimer?: ReturnType<typeof setInterval>;
  private lastAutoRestartAt = 0;
  private lastStatus: TailscaleStatus = {
    running: false,
    connected: false,
    backendState: null,
    tailscaleIPs: [],
    lastCheckAt: null,
  };

  constructor(
    private readonly settings: SettingsService,
    private readonly events: SystemEventsService,
  ) {}

  async onModuleInit() {
    await this.healthcheck();

    const intervalValue = await this.settings.get('tailscale.healthcheckIntervalSec');
    const intervalSec = intervalValue ? parseInt(intervalValue, 10) : NaN;
    const intervalMs =
      (Number.isFinite(intervalSec) && intervalSec > 0 ? intervalSec : DEFAULT_HEALTHCHECK_INTERVAL_SEC) * 1000;

    this.healthcheckTimer = setInterval(() => this.healthcheck(), intervalMs);
  }

  onModuleDestroy() {
    if (this.healthcheckTimer) clearInterval(this.healthcheckTimer);
  }

  getStatus(): TailscaleStatus {
    return this.lastStatus;
  }

  private async healthcheck() {
    const wasConnected = this.lastStatus.connected;
    this.lastStatus = await this.readStatus();

    if (this.lastStatus.connected) {
      if (!wasConnected) {
        await this.events.log('tailscale', 'reconnected');
      }
      return;
    }

    if (wasConnected) {
      await this.events.log('tailscale', 'offline', `état=${this.lastStatus.backendState ?? 'inconnu'}`);
    }

    // Tentative de reconnexion à chaque cycle, indépendamment du réglage de relance
    // automatique : non destructive, elle force juste tailscaled à retenter la
    // négociation avec le coordinateur plutôt que d'attendre son propre backoff interne.
    this.logger.warn(`Tailscale non connecté (état=${this.lastStatus.backendState ?? 'inconnu'}) — tentative de reconnexion`);
    await this.run('tailscale up');
    const reChecked = await this.readStatus();
    this.lastStatus = reChecked;
    if (reChecked.connected) {
      await this.events.log('tailscale', 'reconnected', 'reconnecté via `tailscale up`');
      return;
    }

    await this.maybeAutoRestart();
  }

  private async maybeAutoRestart() {
    const enabled = (await this.settings.get('tailscale.autoRestartEnabled')) === 'true';
    if (!enabled) return;

    const elapsed = Date.now() - this.lastAutoRestartAt;
    if (elapsed < MIN_AUTO_RESTART_INTERVAL_MS) return;

    this.lastAutoRestartAt = Date.now();
    this.logger.warn('Auto-restarting tailscaled (non connecté)');
    try {
      await execAsync('sudo systemctl restart tailscaled', { timeout: 10_000 });
      await this.events.log('tailscale', 'auto_restart', 'tailscaled relancé automatiquement');
    } catch (err: any) {
      const message = err?.stderr?.trim() || err?.message;
      this.logger.error(`Failed to auto-restart tailscaled: ${message}`);
      await this.events.log('tailscale', 'auto_restart', `Échec de la relance automatique : ${message}`);
    }
  }

  async stopService(): Promise<void> {
    try {
      const { stdout } = await execAsync('sudo systemctl stop tailscaled', { timeout: 10_000 });
      void stdout;
    } catch (err: any) {
      throw new Error(err?.stderr?.trim() || err?.message || 'Unknown error');
    }
  }

  private async readStatus(): Promise<TailscaleStatus> {
    const out = await this.run('tailscale status --json');
    if (!out) {
      return { running: false, connected: false, backendState: null, tailscaleIPs: [], lastCheckAt: new Date().toISOString() };
    }
    try {
      const data = JSON.parse(out);
      const backendState: string | null = data.BackendState ?? null;
      return {
        running: true,
        connected: backendState === 'Running',
        backendState,
        tailscaleIPs: data.TailscaleIPs ?? [],
        lastCheckAt: new Date().toISOString(),
      };
    } catch {
      return { running: false, connected: false, backendState: null, tailscaleIPs: [], lastCheckAt: new Date().toISOString() };
    }
  }

  private async run(cmd: string): Promise<string | null> {
    try {
      const { stdout } = await execAsync(cmd, { timeout: 8000 });
      return stdout;
    } catch (err: any) {
      this.logger.debug(`Command failed: ${cmd} — ${err?.stderr?.trim() || err?.message}`);
      return null;
    }
  }
}
