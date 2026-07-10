import { z } from 'zod';

const numericOperatorSchema = z.enum(['eq', 'gt', 'gte', 'lt', 'lte']);

const deviceStateTriggerSchema = z.object({
  type: z.literal('device_state'),
  deviceId: z.string().min(1),
  property: z.string().min(1),
  operator: numericOperatorSchema.default('eq'),
  value: z.unknown(),
});

const cronTriggerSchema = z.object({
  type: z.literal('cron'),
  cron: z.string().min(1),
  randomDelayMin: z.number().min(0).max(120).default(0),
  randomDelayMax: z.number().min(0).max(120).default(0),
});

const deviceUpdateTriggerSchema = z.object({
  type: z.literal('device_update'),
  deviceId: z.string().min(1),
});

const triggerSchema = z.discriminatedUnion('type', [
  deviceStateTriggerSchema,
  cronTriggerSchema,
  deviceUpdateTriggerSchema,
]);

const timeRangeConditionSchema = z.object({
  type: z.literal('time_range'),
  from: z.string().regex(/^\d{2}:\d{2}$/),
  to: z.string().regex(/^\d{2}:\d{2}$/),
});

const deviceStateConditionSchema = z.object({
  type: z.literal('device_state'),
  deviceId: z.string().min(1),
  property: z.string().min(1),
  operator: numericOperatorSchema.default('eq'),
  value: z.unknown(),
});

const deviceDiffConditionSchema = z.object({
  type: z.literal('device_diff'),
  deviceIdA: z.string().min(1),
  propertyA: z.string().min(1),
  deviceIdB: z.string().min(1),
  propertyB: z.string().min(1),
  operator: z.enum(['gt', 'gte', 'lt', 'lte']),
  threshold: z.number().default(0),
});

const conditionSchema = z.discriminatedUnion('type', [
  timeRangeConditionSchema,
  deviceStateConditionSchema,
  deviceDiffConditionSchema,
]);

const deviceCommandActionSchema = z.object({
  type: z.literal('device_command'),
  deviceId: z.string().min(1),
  command: z.record(z.unknown()),
});

const notifyTelegramActionSchema = z.object({
  type: z.literal('notify_telegram'),
  message: z.string().min(1),
});

const notifyEmailActionSchema = z.object({
  type: z.literal('notify_email'),
  subject: z.string().min(1),
  message: z.string().min(1),
});

const actionSchema = z.discriminatedUnion('type', [
  deviceCommandActionSchema,
  notifyTelegramActionSchema,
  notifyEmailActionSchema,
]);

const scenarioCategorySchema = z.enum(['automation', 'alarm']);
const alarmSeveritySchema = z.enum(['critical', 'warning']);

const scenarioCategoryFields = {
  category: scenarioCategorySchema.default('automation'),
  severity: alarmSeveritySchema.optional(),
};

export const createScenarioSchema = z
  .object({
    name: z.string().min(1).max(200),
    enabled: z.boolean().default(true),
    group: z.string().max(100).nullable().optional(),
    ...scenarioCategoryFields,
    trigger: triggerSchema,
    conditions: z.array(conditionSchema).default([]),
    actions: z.array(actionSchema).min(1),
  })
  .refine((dto) => dto.category !== 'alarm' || !!dto.severity, {
    message: 'severity is required when category is "alarm"',
    path: ['severity'],
  });

export const updateScenarioSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    enabled: z.boolean().optional(),
    group: z.string().max(100).nullable().optional(),
    category: scenarioCategorySchema.optional(),
    severity: alarmSeveritySchema.optional(),
    trigger: triggerSchema.optional(),
    conditions: z.array(conditionSchema).optional(),
    actions: z.array(actionSchema).min(1).optional(),
  })
  .refine((dto) => dto.category !== 'alarm' || !!dto.severity, {
    message: 'severity is required when category is "alarm"',
    path: ['severity'],
  });

export type Trigger = z.infer<typeof triggerSchema>;
export type Condition = z.infer<typeof conditionSchema>;
export type Action = z.infer<typeof actionSchema>;
export type CreateScenarioDto = z.infer<typeof createScenarioSchema>;
export type UpdateScenarioDto = z.infer<typeof updateScenarioSchema>;
