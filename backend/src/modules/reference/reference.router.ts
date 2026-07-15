import { Router } from 'express';
import { requireAuth } from '../../common/security/guards';
import { createReferenceController } from './reference.controller';
import type { BossRepo } from '../../db/repositories/bossRepo';

const wrap = (fn: (req: any, res: any) => Promise<unknown> | unknown) =>
  (req: any, res: any, next: any) => Promise.resolve(fn(req, res)).catch(next);

export function createReferenceRouter(bossRepo: BossRepo): Router {
  const c = createReferenceController(bossRepo);
  const r = Router();
  r.get('/reference/classes', requireAuth, wrap(c.classes));
  r.get('/reference/bosses', requireAuth, wrap(c.bosses));
  return r;
}
