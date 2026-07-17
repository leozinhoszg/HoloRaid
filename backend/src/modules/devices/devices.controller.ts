import type { Request, Response } from 'express';
import type { DeviceTokenRepo, Platform } from '../../db/repositories/deviceTokenRepo';

export function createDevicesController(deviceTokenRepo: DeviceTokenRepo) {
  return {
    // O usuario vem SEMPRE do JWT — o cliente não escolhe de quem é o token.
    async register(req: Request, res: Response) {
      const { token, platform } = req.body as { token: string; platform: Platform };
      await deviceTokenRepo.upsert(req.user!.sub, token, platform);
      res.status(204).send();
    },
  };
}
