import { Inject, Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient, Scenario } from '@skbox/db';
import {
  CreateScenarioDto,
  UpdateScenarioDto,
  Trigger,
  Condition,
  Action,
} from '@skbox/shared';
import { CronExpressionParser } from 'cron-parser';
import { MqttService } from '../mqtt/mqtt.service';
import { TriggerContextService, TriggerContextValue } from './trigger-context.service';

@Injectable()
export class ScenariosService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ScenariosService.name);
  private scenariosByDevice = new Map<string, Scenario[]>();
  private cronTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private nextRunDates = new Map<string, Date>();
  private executing = false;

  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly mqtt: MqttService,
    private readonly triggerContext: TriggerContextService,
  ) {}

  async onModuleInit() {
    await this.reloadScenarios();

    this.mqtt.subscribe('zigbee2mqtt/+', async (topic, _payload) => {
      const name = topic.split('/')[1];
      if (name === 'bridge') return;
      const device = await this.prisma.device.findFirst({
        where: { mqttTopic: `zigbee2mqtt/${name}` },
      });
      if (device) await this.evaluateScenariosFor(device.id);
    });

    this.mqtt.subscribe('rfxcom2mqtt/devices/+', async (topic, _payload) => {
      const rfId = topic.split('/')[2];
      const device = await this.prisma.device.findFirst({
        where: { mqttTopic: `rfxcom2mqtt/devices/${rfId}` },
      });
      if (device) await this.evaluateScenariosFor(device.id);
    });

    this.logger.log('Scenario engine started');
  }

  onModuleDestroy() {
    for (const timer of this.cronTimers.values()) clearTimeout(timer);
    this.cronTimers.clear();
  }

  // --- CRUD ---

  async findAll() {
    const scenarios = await this.prisma.scenario.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return scenarios.map(this.parseScenario);
  }

  async findById(id: string) {
    const scenario = await this.prisma.scenario.findUniqueOrThrow({
      where: { id },
    });
    return this.parseScenario(scenario);
  }

  async create(dto: CreateScenarioDto) {
    const scenario = await this.prisma.scenario.create({
      data: {
        name: dto.name,
        enabled: dto.enabled,
        trigger: JSON.stringify(dto.trigger),
        conditions: JSON.stringify(dto.conditions),
        actions: JSON.stringify(dto.actions),
      },
    });
    await this.reloadScenarios();
    return this.parseScenario(scenario);
  }

  async update(id: string, dto: UpdateScenarioDto) {
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.enabled !== undefined) data.enabled = dto.enabled;
    if (dto.trigger !== undefined) data.trigger = JSON.stringify(dto.trigger);
    if (dto.conditions !== undefined)
      data.conditions = JSON.stringify(dto.conditions);
    if (dto.actions !== undefined) data.actions = JSON.stringify(dto.actions);

    const scenario = await this.prisma.scenario.update({
      where: { id },
      data,
    });
    await this.reloadScenarios();
    return this.parseScenario(scenario);
  }

  async delete(id: string) {
    await this.prisma.scenario.delete({ where: { id } });
    this.nextRunDates.delete(id);
    await this.reloadScenarios();
  }

  async testScenario(id: string) {
    const scenario = await this.prisma.scenario.findUniqueOrThrow({
      where: { id },
    });
    const trigger: Trigger = JSON.parse(scenario.trigger);
    const conditions: Condition[] = JSON.parse(scenario.conditions);
    const actions: Action[] = JSON.parse(scenario.actions);
    await this.recordTriggerContextForActions(scenario.name, trigger, conditions, actions);
    await this.executeActions(actions);
    this.logger.log(`Test executed for scenario "${scenario.name}"`);
  }

  // --- Engine ---

  async reloadScenarios() {
    const scenarios = await this.prisma.scenario.findMany({
      where: { enabled: true },
    });

    this.scenariosByDevice.clear();
    for (const timer of this.cronTimers.values()) clearTimeout(timer);
    this.cronTimers.clear();
    this.nextRunDates.clear();

    for (const scenario of scenarios) {
      const trigger: Trigger = JSON.parse(scenario.trigger);
      const conditions: Condition[] = JSON.parse(scenario.conditions);
      const watchedDeviceIds = new Set<string>();

      if (trigger.type === 'device_state') {
        watchedDeviceIds.add(trigger.deviceId);
      } else if (trigger.type === 'cron') {
        this.scheduleCron(scenario, trigger);
      }

      for (const condition of conditions) {
        if (condition.type === 'device_state') watchedDeviceIds.add(condition.deviceId);
        if (condition.type === 'device_diff') {
          watchedDeviceIds.add(condition.deviceIdA);
          watchedDeviceIds.add(condition.deviceIdB);
        }
      }

      for (const deviceId of watchedDeviceIds) {
        const existing = this.scenariosByDevice.get(deviceId) ?? [];
        existing.push(scenario);
        this.scenariosByDevice.set(deviceId, existing);
      }
    }

    this.logger.log(`Loaded ${scenarios.length} active scenario(s)`);
  }

  private scheduleCron(scenario: Scenario, trigger: { cron: string; randomDelayMin?: number; randomDelayMax?: number }) {
    try {
      const expr = CronExpressionParser.parse(trigger.cron);
      const next = expr.next().toDate();
      let delayMs = next.getTime() - Date.now();

      const minDelay = trigger.randomDelayMin ?? 0;
      const maxDelay = trigger.randomDelayMax ?? 0;
      if (maxDelay > 0) {
        const randomMs = (minDelay + Math.random() * (maxDelay - minDelay)) * 60_000;
        delayMs += Math.floor(randomMs);
      }

      const fireAt = new Date(Date.now() + delayMs);
      this.nextRunDates.set(scenario.id, fireAt);
      this.logger.log(`Scenario "${scenario.name}" scheduled at ${fireAt.toLocaleString('fr-FR')}`);

      const timer = setTimeout(async () => {
        this.cronTimers.delete(scenario.id);
        const fresh = await this.prisma.scenario.findUnique({ where: { id: scenario.id } });
        if (!fresh?.enabled) return;

        this.logger.log(`Cron scenario "${fresh.name}" triggered`);
        const actions: Action[] = JSON.parse(fresh.actions);
        const conditions: Condition[] = JSON.parse(fresh.conditions);

        const conditionsMet = await this.evaluateConditions(conditions);
        if (!conditionsMet) {
          this.logger.log(`Cron scenario "${fresh.name}" skipped (conditions not met)`);
          this.scheduleCron(fresh, trigger);
          return;
        }

        await this.recordTriggerContextForActions(fresh.name, { type: 'cron' } as Trigger, conditions, actions);
        await this.executeActions(actions);
        await this.prisma.scenario.update({
          where: { id: fresh.id },
          data: { lastRun: new Date(), runCount: { increment: 1 } },
        });

        this.scheduleCron(fresh, trigger);
      }, delayMs);

      this.cronTimers.set(scenario.id, timer);
    } catch (err) {
      this.logger.error(`Invalid cron for scenario "${scenario.name}": ${err}`);
    }
  }

  private async evaluateScenariosFor(updatedDeviceId: string) {
    if (this.executing) return;

    const scenarios = this.scenariosByDevice.get(updatedDeviceId);
    if (!scenarios?.length) return;

    for (const scenario of scenarios) {
      const trigger: Trigger = JSON.parse(scenario.trigger);
      if (trigger.type !== 'device_state') continue;

      const triggerDevice = await this.prisma.device.findUnique({
        where: { id: trigger.deviceId },
      });
      if (!triggerDevice) continue;

      const triggerState = JSON.parse(triggerDevice.state || '{}');
      const currentValue = triggerState[trigger.property];
      if (!this.compareValues(trigger.operator, currentValue, trigger.value)) continue;

      const conditions: Condition[] = JSON.parse(scenario.conditions);
      const conditionsMet = await this.evaluateConditions(conditions);
      if (!conditionsMet) continue;

      this.logger.log(`Scenario "${scenario.name}" triggered`);

      const actions: Action[] = JSON.parse(scenario.actions);
      this.executing = true;
      try {
        await this.recordTriggerContextForActions(scenario.name, trigger, conditions, actions);
        await this.executeActions(actions);
        await this.prisma.scenario.update({
          where: { id: scenario.id },
          data: {
            lastRun: new Date(),
            runCount: { increment: 1 },
          },
        });
      } finally {
        this.executing = false;
      }
    }
  }

  private async evaluateConditions(conditions: Condition[]): Promise<boolean> {
    for (const condition of conditions) {
      switch (condition.type) {
        case 'time_range': {
          const now = new Date();
          const current = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
          const { from, to } = condition;
          if (from <= to) {
            if (current < from || current > to) return false;
          } else {
            // Midnight crossing: 22:00 → 06:00
            if (current < from && current > to) return false;
          }
          break;
        }
        case 'device_state': {
          const device = await this.prisma.device.findUnique({
            where: { id: condition.deviceId },
          });
          if (!device) return false;
          const deviceState = JSON.parse(device.state);
          const currentValue = deviceState[condition.property];
          if (!this.compareValues(condition.operator, currentValue, condition.value)) return false;
          break;
        }
        case 'device_diff': {
          const [deviceA, deviceB] = await Promise.all([
            this.prisma.device.findUnique({ where: { id: condition.deviceIdA } }),
            this.prisma.device.findUnique({ where: { id: condition.deviceIdB } }),
          ]);
          if (!deviceA || !deviceB) return false;

          const valueA = Number(JSON.parse(deviceA.state)[condition.propertyA]);
          const valueB = Number(JSON.parse(deviceB.state)[condition.propertyB]);
          if (Number.isNaN(valueA) || Number.isNaN(valueB)) return false;

          const diff = valueA - valueB;
          if (!this.compareValues(condition.operator, diff, condition.threshold)) return false;
          break;
        }
      }
    }
    return true;
  }

  private compareValues(operator: string, current: unknown, target: unknown): boolean {
    if (operator === 'eq') return current === target;

    const a = Number(current);
    const b = Number(target);
    if (Number.isNaN(a) || Number.isNaN(b)) return false;

    switch (operator) {
      case 'gt': return a > b;
      case 'gte': return a >= b;
      case 'lt': return a < b;
      case 'lte': return a <= b;
      default: return false;
    }
  }

  // Rassemble les valeurs des capteurs impliqués dans le déclencheur et les conditions
  // d'un scénario (celles qui ont justifié son exécution), pour les attacher à l'entrée
  // d'historique du/des appareil(s) actionné(s) — voir TriggerContextService.
  private async captureTriggerValues(trigger: Trigger, conditions: Condition[]): Promise<TriggerContextValue[]> {
    const refs: { deviceId: string; property: string }[] = [];
    if (trigger.type === 'device_state') refs.push({ deviceId: trigger.deviceId, property: trigger.property });
    for (const condition of conditions) {
      if (condition.type === 'device_state') refs.push({ deviceId: condition.deviceId, property: condition.property });
      if (condition.type === 'device_diff') {
        refs.push({ deviceId: condition.deviceIdA, property: condition.propertyA });
        refs.push({ deviceId: condition.deviceIdB, property: condition.propertyB });
      }
    }
    if (refs.length === 0) return [];

    const dedupedRefs = [...new Map(refs.map((r) => [`${r.deviceId}:${r.property}`, r])).values()];

    const devices = await this.prisma.device.findMany({
      where: { id: { in: [...new Set(dedupedRefs.map((r) => r.deviceId))] } },
    });
    const deviceById = new Map(devices.map((d) => [d.id, d]));

    return dedupedRefs
      .map(({ deviceId, property }) => {
        const device = deviceById.get(deviceId);
        if (!device) return null;
        const state = JSON.parse(device.state || '{}');
        return { deviceId, deviceName: device.name, property, value: state[property] };
      })
      .filter((v): v is TriggerContextValue => v !== null);
  }

  private async recordTriggerContextForActions(scenarioName: string, trigger: Trigger, conditions: Condition[], actions: Action[]) {
    const values = await this.captureTriggerValues(trigger, conditions);
    if (values.length === 0) return;
    for (const action of actions) {
      if (action.type === 'device_command') {
        this.triggerContext.record(action.deviceId, { scenarioName, values });
      }
    }
  }

  private async executeActions(actions: Action[]) {
    for (const action of actions) {
      switch (action.type) {
        case 'device_command': {
          const device = await this.prisma.device.findUnique({
            where: { id: action.deviceId },
          });
          if (!device?.mqttTopic) {
            this.logger.warn(
              `Action skipped: device ${action.deviceId} not found`,
            );
            continue;
          }
          this.mqtt.publish(
            `${device.mqttTopic}/set`,
            JSON.stringify(action.command),
          );
          this.logger.log(
            `Action: ${device.name} → ${JSON.stringify(action.command)}`,
          );
          break;
        }
      }
    }
  }

  private parseScenario = (scenario: Scenario) => {
    return {
      ...scenario,
      trigger: JSON.parse(scenario.trigger) as Trigger,
      conditions: JSON.parse(scenario.conditions) as Condition[],
      actions: JSON.parse(scenario.actions) as Action[],
      nextRun: this.nextRunDates.get(scenario.id)?.toISOString() ?? null,
    };
  };
}
