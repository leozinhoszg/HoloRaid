import type { Request, Response } from 'express';
import type { CharacterService } from './characters.service';
import type { ProgressionService } from '../progression/progression.service';

export function createCharactersController(characterService: CharacterService, progressionService: ProgressionService) {
  return {
    async create(req: Request, res: Response) {
      const created = await characterService.create(req.user!.sub, req.body as any);
      res.status(201).json(created);
    },
    async list(req: Request, res: Response) {
      res.json(await characterService.list(req.user!.sub));
    },
    async get(req: Request, res: Response) {
      res.json(await characterService.get(Number(req.params.id)));
    },
    async update(req: Request, res: Response) {
      res.json(await characterService.update(req.user!.sub, Number(req.params.id), req.body as any));
    },
    async remove(req: Request, res: Response) {
      await characterService.remove(req.user!.sub, Number(req.params.id));
      res.status(204).send();
    },
    async history(req: Request, res: Response) {
      res.json(await progressionService.history(Number(req.params.id)));
    },
    async setBosses(req: Request, res: Response) {
      await characterService.assertOwner(req.user!.sub, Number(req.params.id));
      const { bossIds } = req.body as { bossIds: number[] };
      res.json(await progressionService.setCompletions(Number(req.params.id), bossIds));
    },
  };
}
