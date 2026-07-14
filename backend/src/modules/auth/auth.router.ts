import { Router } from 'express';
import { validate } from '../../common/middleware/validate';
import { callbackSchema, refreshSchema } from './auth.schemas';
import { createAuthController } from './auth.controller';
import type { AuthService } from './auth.service';

// Envolve handlers async para encaminhar rejeições ao errorHandler.
const wrap = (fn: (req: any, res: any) => Promise<unknown> | unknown) =>
  (req: any, res: any, next: any) => Promise.resolve(fn(req, res)).catch(next);

export function createAuthRouter(authService: AuthService): Router {
  const c = createAuthController(authService);
  const r = Router();
  r.get('/discord/url', wrap(c.getDiscordUrl));
  r.post('/callback', validate({ body: callbackSchema }), wrap(c.callback));
  r.post('/refresh', validate({ body: refreshSchema }), wrap(c.refresh));
  r.post('/logout', wrap(c.logout));
  return r;
}
