import { Router } from 'express';
import { requireAuth } from '../../common/security/guards';
import { createDashboardController } from './dashboard.controller';
import type { DashboardService } from './dashboard.service';

const wrap = (fn: (req: any, res: any) => Promise<unknown> | unknown) =>
  (req: any, res: any, next: any) => Promise.resolve(fn(req, res)).catch(next);

export function createDashboardRouter(service: DashboardService): Router {
  const c = createDashboardController(service);
  const r = Router();
  r.get('/dashboard', requireAuth, wrap(c.get));
  return r;
}
