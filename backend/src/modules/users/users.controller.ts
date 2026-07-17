import type { Request, Response } from 'express';
import type { UserService } from './users.service';

export function createUsersController(userService: UserService) {
  return {
    async me(req: Request, res: Response) {
      res.json(await userService.getMe(req.user!.sub));
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
