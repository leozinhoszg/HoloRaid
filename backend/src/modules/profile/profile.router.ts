import { Router } from 'express';
import { requireAuth } from '../../common/security/guards';
import { createProfileController } from './profile.controller';
import type { RaidRepo } from '../../db/repositories/raidRepo';

const wrap = (fn: (req: any, res: any) => Promise<unknown> | unknown) =>
  (req: any, res: any, next: any) => Promise.resolve(fn(req, res)).catch(next);

export function createProfileRouter(raidRepo: RaidRepo): Router {
  const c = createProfileController(raidRepo);
  const r = Router();
  r.get('/me/raids', requireAuth, wrap(c.myRaids));
  return r;
}
