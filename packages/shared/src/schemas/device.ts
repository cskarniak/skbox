import { z } from 'zod';
import { Protocol, DeviceType } from '../types/protocol';

export const createDeviceSchema = z.object({
  name: z.string().min(1).max(100),
  protocol: z.nativeEnum(Protocol),
  type: z.nativeEnum(DeviceType),
  room: z.string().max(100).optional(),
});

export const updateDeviceSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  room: z.string().max(100).optional(),
  visible: z.boolean().optional(),
  active: z.boolean().optional(),
  trackHistory: z.boolean().optional(),
});

export const updateDeviceThemesSchema = z.object({
  themeIds: z.array(z.string()),
});

export const deviceCommandSchema = z.object({
  command: z.string().min(1),
  payload: z.record(z.unknown()).optional(),
});

export type CreateDeviceDto = z.infer<typeof createDeviceSchema>;
export type UpdateDeviceDto = z.infer<typeof updateDeviceSchema>;
export type UpdateDeviceThemesDto = z.infer<typeof updateDeviceThemesSchema>;
export type DeviceCommandDto = z.infer<typeof deviceCommandSchema>;
