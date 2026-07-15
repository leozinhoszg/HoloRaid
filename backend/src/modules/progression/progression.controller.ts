import type { Request, Response } from 'express';
import type { ProgressionService } from './progression.service';

export function createProgressionController(progressionService: ProgressionService) {
  return {
    async award(req: Request, res: Response) {
      const { bossIds } = req.body as { bossIds: number[] };
      res.json(await progressionService.award(Number(req.params.id), bossIds));
    },
    async revoke(req: Request, res: Response) {
      res.json(await progressionService.revoke(Number(req.params.id), Number(req.params.bossId)));
    },
  };
}
