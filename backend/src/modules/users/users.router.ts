import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireAdmin } from '../../common/security/guards';
import { validate } from '../../common/middleware/validate';
import { createUsersController } from './users.controller';
import type { UserService } from './users.service';

const wrap = (fn: (req: any, res: any) => Promise<unknown> | unknown) =>
  (req: any, res: any, next: any) => Promise.resolve(fn(req, res)).catch(next);

const idParam = z.object({ id: z.coerce.number().int().positive() });

export function createUsersRouter(userService: UserService): Router {
  const c = createUsersController(userService);
  const r = Router();
  r.get('/me', requireAuth, wrap(c.me));
  r.get('/users', requireAuth, requireAdmin, wrap(c.list));
  r.post('/users/:id/promote', requireAuth, requireAdmin, validate({ params: idParam }), wrap(c.promote));
  r.post('/users/:id/demote', requireAuth, requireAdmin, validate({ params: idParam }), wrap(c.demote));
  return r;
}
