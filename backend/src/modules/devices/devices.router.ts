import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../common/security/guards';
import { validate } from '../../common/middleware/validate';
import { createDevicesController } from './devices.controller';
import type { DeviceTokenRepo } from '../../db/repositories/deviceTokenRepo';

const wrap = (fn: (req: any, res: any) => Promise<unknown> | unknown) =>
  (req: any, res: any, next: any) => Promise.resolve(fn(req, res)).catch(next);

const registerBody = z.object({
  token: z.string().min(1).max(255),
  platform: z.enum(['android', 'web']),
});

export function createDevicesRouter(deviceTokenRepo: DeviceTokenRepo): Router {
  const c = createDevicesController(deviceTokenRepo);
  const r = Router();
  r.post('/devices', requireAuth, validate({ body: registerBody }), wrap(c.register));
  return r;
}
