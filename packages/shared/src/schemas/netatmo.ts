import { z } from 'zod';

export const netatmoCredentialsSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
});

export const netatmoConnectSchema = z.object({
  code: z.string().min(1),
});

export type NetatmoCredentialsDto = z.infer<typeof netatmoCredentialsSchema>;
export type NetatmoConnectDto = z.infer<typeof netatmoConnectSchema>;
