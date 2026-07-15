import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../common/security/guards';
import { validate } from '../../common/middleware/validate';
import { createCharacterSchema, updateCharacterSchema } from './characters.schemas';
import { createCharactersController } from './characters.controller';
import type { CharacterService } from './characters.service';
import type { ProgressionService } from '../progression/progression.service';

const wrap = (fn: (req: any, res: any) => Promise<unknown> | unknown) =>
  (req: any, res: any, next: any) => Promise.resolve(fn(req, res)).catch(next);
const idParam = z.object({ id: z.coerce.number().int().positive() });

export function createCharactersRouter(characterService: CharacterService, progressionService: ProgressionService): Router {
  const c = createCharactersController(characterService, progressionService);
  const r = Router();
  r.get('/characters', requireAuth, wrap(c.list));
  r.post('/characters', requireAuth, validate({ body: createCharacterSchema }), wrap(c.create));
  r.get('/characters/:id', requireAuth, validate({ params: idParam }), wrap(c.get));
  r.patch('/characters/:id', requireAuth, validate({ params: idParam, body: updateCharacterSchema }), wrap(c.update));
  r.delete('/characters/:id', requireAuth, validate({ params: idParam }), wrap(c.remove));
  r.get('/characters/:id/history', requireAuth, validate({ params: idParam }), wrap(c.history));
  return r;
}
