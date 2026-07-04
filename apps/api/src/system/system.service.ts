import { Injectable, Logger } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';

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
  network: string[];
}

@Injectable()
export class SystemService {
  private readonly logger = new Logger(SystemService.name);

  async getHealth(): Promise<SystemHealth> {
    const [
      governor,
      temperatures,
      fans,
      disk,
      smart,
      docker,
      services,
    ] = await Promise.all([
      this.readGovernor(),
      this.readTemperatures(),
      this.readFans(),
      this.readDisk(),
      this.readSmart(),
      this.readDocker(),
      this.readServices(['mbpfan', 'thermald', 'docker', 'fstrim.timer']),
    ]);

    const cpus = os.cpus();
    const loadAvg = os.loadavg() as [number, number, number];
    const usagePercent = Math.min(
      100,
      Math.round((loadAvg[0] / (cpus.length || 1)) * 100),
    );

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
      network: Object.values(os.networkInterfaces())
        .flat()
        .filter((i): i is os.NetworkInterfaceInfo => !!i && !i.internal && i.family === 'IPv4')
        .map((i) => i.address),
    };
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
}
