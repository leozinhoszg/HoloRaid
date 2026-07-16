import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../common/security/guards';
import { validate } from '../../common/middleware/validate';
import { raidCreateSchema, raidUpdateSchema } from './raids.schemas';
import { createRaidsController } from './raids.controller';
import type { RaidService } from './raids.service';
import type { RaidJoinService } from './raidJoin.service';
import type { RaidBroadcaster } from '../../realtime/broadcaster';

const wrap = (fn: (req: any, res: any) => Promise<unknown> | unknown) =>
  (req: any, res: any, next: any) => Promise.resolve(fn(req, res)).catch(next);
const idParam = z.object({ id: z.coerce.number().int().positive() });
const joinBody = z.object({ personagem_id: z.number().int().positive() });

export function createRaidsRouter(raidService: RaidService, raidJoinService: RaidJoinService, broadcaster?: RaidBroadcaster): Router {
  const c = createRaidsController(raidService, raidJoinService, broadcaster);
  const r = Router();
  r.get('/raids', requireAuth, wrap(c.list));
  r.post('/raids', requireAuth, validate({ body: raidCreateSchema }), wrap(c.create));
  r.get('/raids/code/:codigo', requireAuth, wrap(c.getByCodigo));
  r.get('/raids/:id', requireAuth, validate({ params: idParam }), wrap(c.get));
  r.patch('/raids/:id', requireAuth, validate({ params: idParam, body: raidUpdateSchema }), wrap(c.update));
  r.delete('/raids/:id', requireAuth, validate({ params: idParam }), wrap(c.remove));
  r.post('/raids/:id/duplicate', requireAuth, validate({ params: idParam }), wrap(c.duplicate));
  r.post('/raids/:id/start', requireAuth, validate({ params: idParam }), wrap(c.transition('start')));
  r.post('/raids/:id/finish', requireAuth, validate({ params: idParam }), wrap(c.transition('finish')));
  r.post('/raids/:id/cancel', requireAuth, validate({ params: idParam }), wrap(c.transition('cancel')));
  r.post('/raids/:id/join', requireAuth, validate({ params: idParam, body: joinBody }), wrap(c.join));
  r.delete('/raids/:id/leave', requireAuth, validate({ params: idParam }), wrap(c.leave));
  return r;
}
