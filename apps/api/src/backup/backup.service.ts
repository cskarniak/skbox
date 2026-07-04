import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { CronExpressionParser } from 'cron-parser';
import { SettingsService } from '../settings/settings.service';

const execAsync = promisify(exec);

export interface BackupConfig {
  enabled: boolean;
  cron: string;
  retentionDays: number;
}

export interface BackupFile {
  filename: string;
  mode: 'daily' | 'full';
  sizeBytes: number;
  createdAt: string;
}

const CONFIG_KEY = 'backup-config';
const DEFAULT_CONFIG: BackupConfig = {
  enabled: false,
  cron: '0 3 * * *',
  retentionDays: 14,
};
const FILENAME_RE = /^skbox-(daily|full)-\d{8}-\d{6}\.tar\.gz$/;

function findRepoRoot(startDir: string): string {
  let dir = startDir;
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, 'backup.sh'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('Racine du projet introuvable (backup.sh absent)');
}

@Injectable()
export class BackupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BackupService.name);
  private readonly repoRoot = findRepoRoot(__dirname);
  private readonly backupDir = path.join(this.repoRoot, 'backups');
  private timer: ReturnType<typeof setTimeout> | null = null;
  private nextRun: Date | null = null;

  constructor(private readonly settings: SettingsService) {}

  async onModuleInit() {
    const config = await this.getConfig();
    if (config.enabled) this.scheduleNext(config);
  }

  onModuleDestroy() {
    if (this.timer) clearTimeout(this.timer);
  }

  async getConfig(): Promise<BackupConfig> {
    const raw = await this.settings.get(CONFIG_KEY);
    if (!raw) return DEFAULT_CONFIG;
    try {
      return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    } catch {
      return DEFAULT_CONFIG;
    }
  }

  async setConfig(config: BackupConfig): Promise<BackupConfig> {
    try {
      CronExpressionParser.parse(config.cron);
    } catch {
      throw new BadRequestException('Expression cron invalide');
    }
    if (config.retentionDays < 1 || config.retentionDays > 365) {
      throw new BadRequestException('Rétention hors limites (1 à 365 jours)');
    }

    await this.settings.set(CONFIG_KEY, JSON.stringify(config));

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
      this.nextRun = null;
    }
    if (config.enabled) this.scheduleNext(config);

    return config;
  }

  getNextRun(): string | null {
    return this.nextRun?.toISOString() ?? null;
  }

  private scheduleNext(config: BackupConfig) {
    try {
      const expr = CronExpressionParser.parse(config.cron);
      const next = expr.next().toDate();
      const delayMs = Math.max(0, next.getTime() - Date.now());
      this.nextRun = next;
      this.logger.log(`Sauvegarde automatique planifiée à ${next.toLocaleString('fr-FR')}`);

      this.timer = setTimeout(async () => {
        this.timer = null;
        try {
          await this.run('daily');
          this.logger.log('Sauvegarde automatique terminée');
        } catch (err) {
          this.logger.error(`Sauvegarde automatique échouée: ${err}`);
        }
        const fresh = await this.getConfig();
        if (fresh.enabled) this.scheduleNext(fresh);
      }, delayMs);
    } catch (err) {
      this.logger.error(`Cron de sauvegarde invalide: ${err}`);
    }
  }

  async list(): Promise<BackupFile[]> {
    if (!fs.existsSync(this.backupDir)) return [];
    return fs
      .readdirSync(this.backupDir)
      .filter((f) => FILENAME_RE.test(f))
      .map((filename) => {
        const stat = fs.statSync(path.join(this.backupDir, filename));
        const mode: 'daily' | 'full' = filename.includes('-full-') ? 'full' : 'daily';
        return {
          filename,
          mode,
          sizeBytes: stat.size,
          createdAt: stat.mtime.toISOString(),
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async run(mode: 'daily' | 'full'): Promise<BackupFile> {
    try {
      const { stdout, stderr } = await execAsync(`./backup.sh ${mode}`, {
        cwd: this.repoRoot,
        timeout: 120_000,
      });
      if (stdout) this.logger.log(stdout.trim());
      if (stderr) this.logger.warn(stderr.trim());
    } catch (err) {
      throw new BadRequestException(`Échec de la sauvegarde: ${err}`);
    }

    const files = await this.list();
    const latest = files.find((f) => f.mode === mode);
    if (!latest) throw new BadRequestException('Sauvegarde échouée: archive introuvable après exécution');
    return latest;
  }

  async restore(filename: string): Promise<void> {
    this.assertSafeFilename(filename);
    const filePath = path.join(this.backupDir, filename);
    if (!fs.existsSync(filePath)) throw new BadRequestException('Fichier de sauvegarde introuvable');

    // restore.sh stops the running services (including this very API process) as its
    // first step. If it inherited this process's stdout/stderr pipes, that self-kill
    // closes the read end mid-write and SIGPIPEs the script before it finishes. So it's
    // launched detached, writing to a log file instead of a pipe, and not awaited: the
    // API is expected to go down partway through and won't be around to see it finish.
    const logPath = path.join(this.backupDir, `restore-${Date.now()}.log`);
    const logFd = fs.openSync(logPath, 'a');
    const child = spawn('./restore.sh', [`backups/${filename}`, '--yes'], {
      cwd: this.repoRoot,
      detached: true,
      stdio: ['ignore', logFd, logFd],
    });
    child.unref();
  }

  delete(filename: string): void {
    this.assertSafeFilename(filename);
    const filePath = path.join(this.backupDir, filename);
    if (!fs.existsSync(filePath)) throw new BadRequestException('Fichier de sauvegarde introuvable');
    fs.unlinkSync(filePath);
  }

  getFilePath(filename: string): string {
    this.assertSafeFilename(filename);
    const filePath = path.join(this.backupDir, filename);
    if (!fs.existsSync(filePath)) throw new BadRequestException('Fichier de sauvegarde introuvable');
    return filePath;
  }

  private assertSafeFilename(filename: string) {
    if (!FILENAME_RE.test(filename)) throw new BadRequestException('Nom de fichier invalide');
  }
}
