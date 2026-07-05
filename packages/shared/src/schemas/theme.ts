import { z } from 'zod';

export const createThemeSchema = z.object({
  name: z.string().min(1).max(100),
  icon: z.string().max(50).optional(),
});

export const updateThemeSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  icon: z.string().max(50).optional(),
  order: z.number().int().optional(),
});

export type CreateThemeDto = z.infer<typeof createThemeSchema>;
export type UpdateThemeDto = z.infer<typeof updateThemeSchema>;
