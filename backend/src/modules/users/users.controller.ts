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
  };
}
