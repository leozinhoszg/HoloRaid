import type { Request, Response } from 'express';
import type { RaidService, Actor } from './raids.service';
import type { RaidJoinService } from './raidJoin.service';

const actorOf = (req: Request): Actor => ({ sub: req.user!.sub, role: req.user!.role });

export function createRaidsController(raidService: RaidService, raidJoinService: RaidJoinService) {
  return {
    async create(req: Request, res: Response) {
      res.status(201).json(await raidService.create(actorOf(req), req.body as any));
    },
    async list(req: Request, res: Response) {
      const { status, faction, operation } = req.query as Record<string, string | undefined>;
      res.json(await raidService.list({ status, faction, operation }));
    },
    async get(req: Request, res: Response) {
      res.json(await raidService.getDetail(Number(req.params.id)));
    },
    async getByCodigo(req: Request, res: Response) {
      res.json(await raidService.getByCodigo(String(req.params.codigo)));
    },
    async update(req: Request, res: Response) {
      res.json(await raidService.update(actorOf(req), Number(req.params.id), req.body as any));
    },
    async remove(req: Request, res: Response) {
      await raidService.remove(actorOf(req), Number(req.params.id));
      res.status(204).send();
    },
    async duplicate(req: Request, res: Response) {
      res.status(201).json(await raidService.duplicate(actorOf(req), Number(req.params.id)));
    },
    transition(action: 'start' | 'finish' | 'cancel') {
      return async (req: Request, res: Response) => {
        res.json(await raidService.transition(actorOf(req), Number(req.params.id), action));
      };
    },
    async join(req: Request, res: Response) {
      const { personagem_id } = req.body as { personagem_id: number };
      res.json(await raidJoinService.join(req.user!.sub, Number(req.params.id), personagem_id));
    },
    async leave(req: Request, res: Response) {
      await raidJoinService.leave(req.user!.sub, Number(req.params.id));
      res.status(204).send();
    },
  };
}
