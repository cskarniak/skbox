import { z } from 'zod';

export const historyTemplatePanelSchema = z.object({
  deviceId: z.string().nullable(),
  valueKey: z.string().nullable(),
  displayType: z.enum(['value', 'chart']),
  chartType: z.enum(['line', 'bar', 'area']),
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
