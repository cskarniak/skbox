import { Injectable, Logger } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';
import { ZigbeeService } from '../zigbee/zigbee.service';
import { RfxcomService } from '../rfxcom/rfxcom.service';
import { TailscaleService } from '../tailscale/tailscale.service';
import { SystemEventsService } from '../system-events/system-events.service';

const execAsync = promisify(exec);

export interface ServiceStatus {
  name: string;
  active: boolean;
}

export interface DockerContainer {
  name: string;
  status: string;
}

export interface SystemHealth {
  hostname: string;
  timestamp: string;
  uptimeSeconds: number;
  loadAvg: [number, number, number];
  cpu: {
    cores: number;
    usagePercent: number;
    governor: string | null;
  };
  temperatures: { label: string; celsius: number }[];
  fans: { label: string; rpm: number; minRpm: number | null; maxRpm: number | null }[];
  memory: {
    totalMB: number;
    usedMB: number;
    usedPercent: number;
  };
  disk: {
    totalGB: number;
    usedGB: number;
    usedPercent: number;
  };
  smart: {
    health: string | null;
    temperatureC: number | null;
    powerOnHours: number | null;
  };
  docker: {
    active: boolean;
    containers: DockerContainer[];
  };
  services: ServiceStatus[];
  bridges: {
    zigbee: boolean;
    rfxcom: boolean;
  };
  tailscale: {
    connected: boolean;
    backendState: string | null;
    ips: string[];
  };
  network: string[];
  thermalShutdown: {
    active: boolean;
    limitCelsius: number | null;
    lastCheckAt: string | null;
    lastTempCelsius: number | null;
  };
}

@Injectable()
export class SystemService {
  private readonly logger = new Logger(SystemService.name);
  // Le load average (os.loadavg) est une moyenne lissée sur 1/5/15 min du nombre de
  // processus en attente, pas un pourcentage d'utilisation CPU instantané : sur cette
  // machine peu chargée, il reste presque toujours proche de 0 même lors de pics
  // d'activité courts. On calcule plutôt un vrai %CPU par delta des ticks os.cpus()
  // entre deux appels successifs de getHealth(), comme le fait `top`.
  private lastCpuTimes: os.CpuInfo['times'][] | null = null;

  constructor(
    private readonly zigbee: ZigbeeService,
    private readonly rfxcom: RfxcomService,
    private readonly tailscale: TailscaleService,
    private readonly events: SystemEventsService,
  ) {}

  async getEvents(limit?: number) {
    return this.events.list(limit);
  }

  async getHealth(): Promise<SystemHealth> {
    const [
      governor,
      temperatures,
      fans,
      disk,
      smart,
      docker,
      services,
      thermalShutdown,
    ] = await Promise.all([
      this.readGovernor(),
      this.readTemperatures(),
      this.readFans(),
      this.readDisk(),
      this.readSmart(),
      this.readDocker(),
      this.readServices(['mbpfan', 'thermald', 'docker', 'fstrim.timer', 'mosquitto', 'skbox-z2m', 'skbox-rfxcom']),
      this.readThermalShutdown(),
    ]);

    const cpus = os.cpus();
    const loadAvg = os.loadavg() as [number, number, number];
    const usagePercent = this.computeCpuUsagePercent(cpus);

    const totalMB = Math.round(os.totalmem() / 1024 / 1024);
    const freeMB = Math.round(os.freemem() / 1024 / 1024);
    const usedMB = totalMB - freeMB;

    return {
      hostname: os.hostname(),
      timestamp: new Date().toISOString(),
      uptimeSeconds: os.uptime(),
      loadAvg,
      cpu: {
        cores: cpus.length,
        usagePercent,
        governor,
      },
      temperatures,
      fans,
      memory: {
        totalMB,
        usedMB,
        usedPercent: Math.round((usedMB / totalMB) * 100),
      },
      disk,
      smart,
      docker,
      services,
      bridges: {
        zigbee: this.zigbee.isBridgeOnline(),
        rfxcom: this.rfxcom.isBridgeOnline(),
      },
      tailscale: (() => {
        const status = this.tailscale.getStatus();
        return { connected: status.connected, backendState: status.backendState, ips: status.tailscaleIPs };
      })(),
      network: Object.values(os.networkInterfaces())
        .flat()
        .filter((i): i is os.NetworkInterfaceInfo => !!i && !i.internal && i.family === 'IPv4')
        .map((i) => i.address),
      thermalShutdown,
    };
  }

  async setThermalShutdownActive(active: boolean): Promise<void> {
    const action = active ? 'start' : 'stop';
    await this.runOrThrow(`sudo systemctl ${action} thermal-shutdown.timer`);
  }

  // Arrêt volontaire d'un bridge pour vérifier en conditions réelles que la relance
  // automatique (ZigbeeService/RfxcomService) se déclenche bien — sans avoir à
  // débrancher un dongle. Le service se relance seul si l'option est activée dans
  // Réglages > Préférences, sinon il restera arrêté jusqu'à une relance manuelle.
  async stopBridgeService(bridge: 'zigbee' | 'rfxcom'): Promise<void> {
    const service = bridge === 'zigbee' ? 'skbox-z2m' : 'skbox-rfxcom';
    await this.runOrThrow(`sudo systemctl stop ${service}`);
    await this.events.log(bridge, 'manual_stop', `${service} arrêté manuellement (test)`);
  }

  // Même principe que stopBridgeService : arrêt volontaire de tailscaled pour vérifier
  // en conditions réelles que la relance automatique (TailscaleService) fonctionne.
  async stopTailscaleService(): Promise<void> {
    await this.runOrThrow('sudo systemctl stop tailscaled');
    await this.events.log('tailscale', 'manual_stop', 'tailscaled arrêté manuellement (test)');
  }

  private async runOrThrow(cmd: string): Promise<string> {
    try {
      const { stdout } = await execAsync(cmd, { timeout: 5000 });
      return stdout;
    } catch (err: any) {
      const message = err?.stderr?.trim() || err?.message || 'Unknown error';
      throw new Error(message);
    }
  }

  private async run(cmd: string): Promise<string | null> {
    try {
      const { stdout } = await execAsync(cmd, { timeout: 5000 });
      return stdout;
    } catch (err: any) {
      if (err?.stdout) return err.stdout;
      this.logger.debug(`Command failed: ${cmd} — ${err?.message}`);
      return null;
    }
  }

  private computeCpuUsagePercent(cpus: os.CpuInfo[]): number {
    const currentTimes = cpus.map((c) => c.times);
    const previousTimes = this.lastCpuTimes;
    this.lastCpuTimes = currentTimes;

    if (!previousTimes || previousTimes.length !== currentTimes.length) {
      return 0;
    }

    let idleDelta = 0;
    let totalDelta = 0;
    currentTimes.forEach((times, i) => {
      const prev = previousTimes[i];
      const total = times.user + times.nice + times.sys + times.idle + times.irq;
      const prevTotal = prev.user + prev.nice + prev.sys + prev.idle + prev.irq;
      idleDelta += times.idle - prev.idle;
      totalDelta += total - prevTotal;
    });

    if (totalDelta <= 0) return 0;
    return Math.min(100, Math.max(0, Math.round((1 - idleDelta / totalDelta) * 100)));
  }

  private async readGovernor(): Promise<string | null> {
    const out = await this.run(
      'cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor',
    );
    return out?.trim() ?? null;
  }

  private async readTemperatures(): Promise<{ label: string; celsius: number }[]> {
    const out = await this.run('sensors');
    if (!out) return [];
    const result: { label: string; celsius: number }[] = [];
    const lines = out.split('\n');
    for (const line of lines) {
      const match = line.match(
        /^(Package id 0|Core \d+|TM0P|TA0P)\s*:\s*\+?(-?\d+(\.\d+)?)/,
      );
      if (match) {
        result.push({ label: match[1], celsius: parseFloat(match[2]) });
      }
    }
    return result;
  }

  private async readFans(): Promise<SystemHealth['fans']> {
    const out = await this.run('sensors');
    if (!out) return [];
    const result: SystemHealth['fans'] = [];
    for (const line of out.split('\n')) {
      const match = line.match(
        /^(\w+)\s*:\s*(\d+)\s*RPM\s*(?:\(min\s*=\s*(\d+)\s*RPM,\s*max\s*=\s*(\d+)\s*RPM\))?/,
      );
      if (match) {
        result.push({
          label: match[1],
          rpm: parseInt(match[2], 10),
          minRpm: match[3] ? parseInt(match[3], 10) : null,
          maxRpm: match[4] ? parseInt(match[4], 10) : null,
        });
      }
    }
    return result;
  }

  private async readDisk(): Promise<SystemHealth['disk']> {
    const out = await this.run('df -k /');
    if (!out) return { totalGB: 0, usedGB: 0, usedPercent: 0 };
    const line = out.split('\n')[1];
    const parts = line?.split(/\s+/) ?? [];
    const totalKB = parseInt(parts[1] ?? '0', 10);
    const usedKB = parseInt(parts[2] ?? '0', 10);
    return {
      totalGB: Math.round((totalKB / 1024 / 1024) * 10) / 10,
      usedGB: Math.round((usedKB / 1024 / 1024) * 10) / 10,
      usedPercent: totalKB ? Math.round((usedKB / totalKB) * 100) : 0,
    };
  }

  private async readSmart(): Promise<SystemHealth['smart']> {
    const health = await this.run('sudo smartctl -H /dev/sda');
    const attrs = await this.run('sudo smartctl -A /dev/sda');
    if (!health && !attrs) {
      return { health: null, temperatureC: null, powerOnHours: null };
    }
    const healthMatch = health?.match(/test result:\s*(\w+)/i);
    // SMART attribute lines are: ID# NAME FLAG VALUE WORST THRESH TYPE UPDATED WHEN_FAILED RAW_VALUE
    // VALUE/WORST are normalized scores (e.g. temperature's VALUE is often ~100-raw°C
    // and stays near 100), not the actual reading — skip to the RAW_VALUE column.
    const rawValueRegex = (name: string) =>
      new RegExp(`${name}\\s+\\S+\\s+\\d+\\s+\\d+\\s+\\d+\\s+\\S+\\s+\\S+\\s+\\S+\\s+(\\d+)`);
    const tempMatch = attrs?.match(rawValueRegex('Temperature_Celsius'));
    const hoursMatch = attrs?.match(rawValueRegex('Power_On_Hours'));
    return {
      health: healthMatch?.[1] ?? null,
      temperatureC: tempMatch ? parseInt(tempMatch[1], 10) : null,
      powerOnHours: hoursMatch ? parseInt(hoursMatch[1], 10) : null,
    };
  }

  private async readDocker(): Promise<SystemHealth['docker']> {
    const active = await this.run('systemctl is-active docker');
    const isActive = active?.trim() === 'active';
    if (!isActive) return { active: false, containers: [] };

    const out = await this.run(
      'docker ps --format "{{.Names}}|{{.Status}}"',
    );
    const containers = (out ?? '')
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [name, status] = line.split('|');
        return { name, status };
      });
    return { active: true, containers };
  }

  private async readServices(names: string[]): Promise<ServiceStatus[]> {
    return Promise.all(
      names.map(async (name) => {
        const out = await this.run(`systemctl is-active ${name}`);
        return { name, active: out?.trim() === 'active' };
      }),
    );
  }

  private async readThermalShutdown(): Promise<SystemHealth['thermalShutdown']> {
    const [activeOut, scriptOut, logMtime, logTail] = await Promise.all([
      this.run('systemctl is-active thermal-shutdown.timer'),
      this.run('cat /usr/local/sbin/thermal-shutdown.sh'),
      this.run('stat -c %Y /var/log/thermal-shutdown.log'),
      this.run('tail -1 /var/log/thermal-shutdown.log'),
    ]);

    const limitMatch = scriptOut?.match(/^LIMIT=(\d+)/m);
    const tempMatch = logTail?.match(/Température CPU:\s*(-?\d+)/);
    const mtime = logMtime ? parseInt(logMtime.trim(), 10) : NaN;

    return {
      active: activeOut?.trim() === 'active',
      limitCelsius: limitMatch ? parseInt(limitMatch[1], 10) : null,
      lastCheckAt: Number.isNaN(mtime) ? null : new Date(mtime * 1000).toISOString(),
      lastTempCelsius: tempMatch ? parseInt(tempMatch[1], 10) : null,
    };
  }
}
