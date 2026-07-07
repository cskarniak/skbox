import { z } from 'zod';

export const historyTemplatePanelSchema = z.object({
  deviceId: z.string().nullable(),
  valueKey: z.string().nullable(),
  displayType: z.enum(['value', 'chart', 'table']),
  chartType: z.enum(['line', 'bar', 'area']),
  // Quand true, ce panel n'affiche pas son propre graphique : sa courbe est superposée
  // à celle du panel de type "chart" qui le précède immédiatement dans la liste.
  overlay: z.boolean().default(false),
});

export const createHistoryTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  panels: z.array(historyTemplatePanelSchema).default([]),
});

export const updateHistoryTemplateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  panels: z.array(historyTemplatePanelSchema).optional(),
});

export type HistoryTemplatePanel = z.infer<typeof historyTemplatePanelSchema>;
export type CreateHistoryTemplateDto = z.infer<typeof createHistoryTemplateSchema>;
export type UpdateHistoryTemplateDto = z.infer<typeof updateHistoryTemplateSchema>;
