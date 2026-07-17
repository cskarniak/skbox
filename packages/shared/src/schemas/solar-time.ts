import { z } from 'zod';

const fixedTimeSchema = z.object({
  mode: z.literal('fixed'),
  time: z.string().regex(/^\d{2}:\d{2}$/),
});

const solarTimeSchema = z.object({
  mode: z.literal('solar'),
  reference: z.enum(['sunrise', 'sunset']),
  offsetMinutes: z.number().int().min(-180).max(180).default(0),
});

export const timeOrSolarSchema = z.discriminatedUnion('mode', [fixedTimeSchema, solarTimeSchema]);

export type TimeOrSolar = z.infer<typeof timeOrSolarSchema>;
