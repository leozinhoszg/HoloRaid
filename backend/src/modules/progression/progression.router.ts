import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireAdmin } from '../../common/security/guards';
import { validate } from '../../common/middleware/validate';
import { createProgressionController } from './progression.controller';
import type { ProgressionService } from './progression.service';

const wrap = (fn: (req: any, res: any) => Promise<unknown> | unknown) =>
  (req: any, res: any, next: any) => Promise.resolve(fn(req, res)).catch(next);
const awardSchema = z.object({ bossIds: z.array(z.number().int().positive()).min(1) });
const bossIdsSchema = z.object({ bossIds: z.array(z.number().int().positive()) });
const idParam = z.object({ id: z.coerce.number().int().positive() });
const idBossParam = z.object({ id: z.coerce.number().int().positive(), bossId: z.coerce.number().int().positive() });

export function createProgressionRouter(progressionService: ProgressionService): Router {
  const c = createProgressionController(progressionService);
  const r = Router();
  r.get('/me/bosses', requireAuth, wrap(c.myHistory));
  r.put('/me/bosses', requireAuth, validate({ body: bossIdsSchema }), wrap(c.setMine));
  r.post('/admin/users/:id/bosses', requireAuth, requireAdmin, validate({ params: idParam, body: awardSchema }), wrap(c.award));
  r.delete('/admin/users/:id/bosses/:bossId', requireAuth, requireAdmin, validate({ params: idBossParam }), wrap(c.revoke));
  return r;
}
