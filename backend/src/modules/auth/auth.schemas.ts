import { z } from 'zod';

export const callbackSchema = z.object({
  code: z.string().min(1),
  codeVerifier: z.string().min(1),
  device: z.string().max(64).optional(),
});

export const refreshSchema = z.object({
  refreshToken: z.string().optional(), // mobile/desktop enviam no body; Web usa cookie
  device: z.string().max(64).optional(),
});
