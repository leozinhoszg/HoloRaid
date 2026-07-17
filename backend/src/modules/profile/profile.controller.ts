import type { Request, Response } from 'express';
import type { RaidRepo } from '../../db/repositories/raidRepo';

export function createProfileController(raidRepo: RaidRepo) {
  return {
    async myRaids(req: Request, res: Response) {
      res.json(await raidRepo.listForUser(req.user!.sub));
    },
  };
}
