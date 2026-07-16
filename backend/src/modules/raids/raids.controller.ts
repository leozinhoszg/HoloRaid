import type { Request, Response } from 'express';
import type { RaidService, Actor } from './raids.service';
import type { RaidJoinService } from './raidJoin.service';
import { noopBroadcaster, type RaidBroadcaster } from '../../realtime/broadcaster';

const actorOf = (req: Request): Actor => ({ sub: req.user!.sub, role: req.user!.role });

const EVENT: Record<'start' | 'finish' | 'cancel', string> = {
  start: 'raidStarted', finish: 'raidFinished', cancel: 'raidCancelled',
};

export function createRaidsController(raidService: RaidService, raidJoinService: RaidJoinService, broadcaster: RaidBroadcaster = noopBroadcaster) {
  return {
    async create(req: Request, res: Response) {
      const detail = await raidService.create(actorOf(req), req.body as any);
      broadcaster.raidCreated(detail);
      res.status(201).json(detail);
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
      const detail = await raidService.update(actorOf(req), Number(req.params.id), req.body as any);
      broadcaster.raidUpdated(detail, 'raidUpdated');
      res.json(detail);
    },
    async remove(req: Request, res: Response) {
      const id = Number(req.params.id);
      await raidService.remove(actorOf(req), id);
      broadcaster.raidRemoved(id);
      res.status(204).send();
    },
    async duplicate(req: Request, res: Response) {
      const detail = await raidService.duplicate(actorOf(req), Number(req.params.id));
      broadcaster.raidCreated(detail);
      res.status(201).json(detail);
    },
    transition(action: 'start' | 'finish' | 'cancel') {
      return async (req: Request, res: Response) => {
        const detail = await raidService.transition(actorOf(req), Number(req.params.id), action);
        broadcaster.raidUpdated(detail, EVENT[action]);
        res.json(detail);
      };
    },
    async join(req: Request, res: Response) {
      const id = Number(req.params.id);
      const { personagem_id } = req.body as { personagem_id: number };
      const result = await raidJoinService.join(req.user!.sub, id, personagem_id);
      broadcaster.raidUpdated(await raidService.getDetail(id), 'playerJoined');
      res.json(result);
    },
    async leave(req: Request, res: Response) {
      const id = Number(req.params.id);
      await raidJoinService.leave(req.user!.sub, id);
      broadcaster.raidUpdated(await raidService.getDetail(id), 'playerLeft');
      res.status(204).send();
    },
  };
}
