import type { Request, Response } from 'express';
import { FACTIONS, ROLES, COMBAT_STYLES, DISCIPLINES } from '../../reference/swtor';
import type { BossRepo } from '../../db/repositories/bossRepo';

export function createReferenceController(bossRepo: BossRepo) {
  return {
    classes(_req: Request, res: Response) {
      const originStories = [...new Set(COMBAT_STYLES.map((c) => c.originStory))];
      res.json({ factions: FACTIONS, roles: ROLES, originStories, combatStyles: COMBAT_STYLES, disciplines: DISCIPLINES });
    },
    async bosses(_req: Request, res: Response) {
      const all = await bossRepo.list();
      const byOperation: Record<string, typeof all> = {};
      for (const b of all) (byOperation[b.operation] ??= []).push(b);
      res.json({ bosses: all, byOperation });
    },
  };
}
