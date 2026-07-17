import { z } from 'zod';
import { timeOrSolarSchema } from './solar-time';

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
  })
  .refine(checkRanges, RANGE_ERROR);

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
  })
  .refine(checkRanges, RANGE_ERROR);

export type CreatePresenceSimulationDto = z.infer<typeof createPresenceSimulationSchema>;
export type UpdatePresenceSimulationDto = z.infer<typeof updatePresenceSimulationSchema>;
