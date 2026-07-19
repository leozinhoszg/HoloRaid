import type { Request, Response } from 'express';
import type { UserService } from './users.service';
import { calcularTier, pointsToNextTier } from '../../common/progression/tier';

export function createUsersController(userService: UserService) {
  return {
    async me(req: Request, res: Response) {
      const u = await userService.getMe(req.user!.sub);
      res.json({ ...u, tier: calcularTier(u.total_points), pointsToNextTier: pointsToNextTier(u.total_points) });
    },
    async list(_req: Request, res: Response) {
      res.json(await userService.list());
    },
    async promote(req: Request, res: Response) {
      await userService.promote(req.user!.sub, Number(req.params.id));
      res.status(204).send();
    },
    async demote(req: Request, res: Response) {
      await userService.demote(req.user!.sub, Number(req.params.id));
      res.status(204).send();
    },
    async setPush(req: Request, res: Response) {
      const { enabled } = req.body as { enabled: boolean };
      await userService.setPushEnabled(req.user!.sub, enabled);
      res.status(204).send();
    },
  };
}
