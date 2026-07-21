import { z } from 'zod';
import { timeOrSolarSchema } from './solar-time';
import { validatePresenceSimulationParams } from './presence-simulation-validation';

const hhmmSchema = z.string().regex(/^\d{2}:\d{2}$/, 'Format HH:MM attendu');

function checkRanges(dto: {
  onRandomOffsetMin?: number;
  onRandomOffsetMax?: number;
  offRandomOffsetMin?: number;
  offRandomOffsetMax?: number;
  toggleCountMin?: number;
  toggleCountMax?: number;
  toggleDurationMin?: number;
  toggleDurationMax?: number;
}) {
  if (dto.onRandomOffsetMin !== undefined && dto.onRandomOffsetMax !== undefined && dto.onRandomOffsetMin > dto.onRandomOffsetMax) return false;
  if (dto.offRandomOffsetMin !== undefined && dto.offRandomOffsetMax !== undefined && dto.offRandomOffsetMin > dto.offRandomOffsetMax) return false;
  if (dto.toggleCountMin !== undefined && dto.toggleCountMax !== undefined && dto.toggleCountMin > dto.toggleCountMax) return false;
  if (dto.toggleDurationMin !== undefined && dto.toggleDurationMax !== undefined && dto.toggleDurationMin > dto.toggleDurationMax) return false;
  return true;
}

const RANGE_ERROR = { message: 'Les valeurs "min" doivent être inférieures ou égales aux valeurs "max"' };

// N'ajoute que les erreurs bloquantes (pas les avertissements, purement informatifs côté UI) :
// l'allumage et l'extinction restent toujours prioritaires, cette vérification sert seulement
// à rejeter les configurations où une bascule ne pourrait jamais s'exécuter avant l'extinction.
function checkToggleWindowFeasibility(
  dto: {
    onTime?: unknown;
    offTime?: unknown;
    toggleWindowStart?: string;
    toggleWindowEnd?: string;
    toggleCountMin?: number;
    toggleCountMax?: number;
    toggleDurationMin?: number;
    toggleDurationMax?: number;
  },
  ctx: z.RefinementCtx,
) {
  if (
    dto.onTime === undefined ||
    dto.offTime === undefined ||
    dto.toggleWindowStart === undefined ||
    dto.toggleWindowEnd === undefined ||
    dto.toggleCountMin === undefined ||
    dto.toggleCountMax === undefined ||
    dto.toggleDurationMin === undefined ||
    dto.toggleDurationMax === undefined
  ) {
    return;
  }
  const issues = validatePresenceSimulationParams(dto as Parameters<typeof validatePresenceSimulationParams>[0]);
  for (const issue of issues) {
    if (issue.severity !== 'error') continue;
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: issue.message, path: [issue.field] });
  }
}

export const createPresenceSimulationSchema = z
  .object({
    name: z.string().min(1).max(200),
    enabled: z.boolean().default(true),
    lightDeviceIds: z.array(z.string().min(1)).min(1),
    onTime: timeOrSolarSchema,
    offTime: timeOrSolarSchema,
    onRandomOffsetMin: z.number().int().min(0).max(180).default(0),
    onRandomOffsetMax: z.number().int().min(0).max(180).default(0),
    offRandomOffsetMin: z.number().int().min(0).max(180).default(0),
    offRandomOffsetMax: z.number().int().min(0).max(180).default(0),
    toggleCountMin: z.number().int().min(0).max(50).default(0),
    toggleCountMax: z.number().int().min(0).max(50).default(0),
    toggleDurationMin: z.number().int().min(1).max(600).default(1),
    toggleDurationMax: z.number().int().min(1).max(600).default(30),
    toggleWindowStart: hhmmSchema.default('22:00'),
    toggleWindowEnd: hhmmSchema.default('23:00'),
  })
  .refine(checkRanges, RANGE_ERROR)
  .superRefine(checkToggleWindowFeasibility);

export const updatePresenceSimulationSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    enabled: z.boolean().optional(),
    lightDeviceIds: z.array(z.string().min(1)).min(1).optional(),
    onTime: timeOrSolarSchema.optional(),
    offTime: timeOrSolarSchema.optional(),
    onRandomOffsetMin: z.number().int().min(0).max(180).optional(),
    onRandomOffsetMax: z.number().int().min(0).max(180).optional(),
    offRandomOffsetMin: z.number().int().min(0).max(180).optional(),
    offRandomOffsetMax: z.number().int().min(0).max(180).optional(),
    toggleCountMin: z.number().int().min(0).max(50).optional(),
    toggleCountMax: z.number().int().min(0).max(50).optional(),
    toggleDurationMin: z.number().int().min(1).max(600).optional(),
    toggleDurationMax: z.number().int().min(1).max(600).optional(),
    toggleWindowStart: hhmmSchema.optional(),
    toggleWindowEnd: hhmmSchema.optional(),
  })
  .refine(checkRanges, RANGE_ERROR)
  .superRefine(checkToggleWindowFeasibility);

export type CreatePresenceSimulationDto = z.infer<typeof createPresenceSimulationSchema>;
export type UpdatePresenceSimulationDto = z.infer<typeof updatePresenceSimulationSchema>;
