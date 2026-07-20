import type { PushGateway, PushMessage } from './gateway';
import type { DmGateway } from './dmGateway';
import { noopDmGateway } from './dmGateway';
import type { DeviceTokenRepo } from '../db/repositories/deviceTokenRepo';
import type { UserRepo } from '../db/repositories/userRepo';
import type { RaidDetail } from '../modules/raids/raids.service';
import { logger } from '../common/logger/logger';

type Deps = { gateway: PushGateway; deviceTokenRepo: DeviceTokenRepo; userRepo: UserRepo; dmGateway?: DmGateway };

const DIFF: Record<string, string> = { SM: 'Story Mode', HM: 'Veteran', NiM: 'Master' };
const label = (d: RaidDetail) => `${d.operation} (${DIFF[d.difficulty] ?? d.difficulty})`;
const dataOf = (d: RaidDetail, event: string) => ({ raidId: String(d.id), codigo: d.codigo, event });

export function createNotificationService(deps: Deps) {
  const dm = deps.dmGateway ?? noopDmGateway;

  // Roteia por usuário: tem token FCM -> push; não tem -> DM.
  // Os dois conjuntos são disjuntos por construção, então nunca duplica.
  async function sendTo(userIds: number[], msg: PushMessage): Promise<void> {
    if (!userIds.length) return;
    const users = await deps.userRepo.findByIds(userIds);
    const enabled = users.filter((u) => u.push_enabled);
    if (!enabled.length) return;

    const deviceTokens = await deps.deviceTokenRepo.listByUsuarios(enabled.map((u) => u.id));
    const comToken = new Set(deviceTokens.map((t) => t.usuario_id));

    // canal 1 — FCM
    const tokens = deviceTokens.map((t) => t.token);
    if (tokens.length) {
      const { invalidTokens } = await deps.gateway.send(tokens, msg);
      if (invalidTokens.length) await deps.deviceTokenRepo.deleteByTokens(invalidTokens);
    }

    // canal 2 — DM para quem não tem app
    const alvos = enabled.filter((u) => !comToken.has(u.id)).map((u) => u.discord_id);
    if (alvos.length) await dm.send(alvos, msg);
  }

  const rosterIds = (d: RaidDetail) => [...new Set(d.roster.map((r) => r.usuario_id))];
  // Best-effort: push nunca derruba o fluxo que o chamou.
  const guard = (p: Promise<void>) => p.catch((err) => { logger.error({ err }, 'push: send failed'); });

  return {
    async slotConfirmed(userId: number, detail: RaidDetail): Promise<void> {
      await guard(sendTo([userId], {
        title: "You're in!",
        body: `A spot opened up — you're confirmed for ${label(detail)}.`,
        data: dataOf(detail, 'slotConfirmed'),
      }));
    },
    async raidCancelled(detail: RaidDetail): Promise<void> {
      await guard(sendTo(rosterIds(detail), {
        title: 'Raid cancelled',
        body: `${label(detail)} was cancelled.`,
        data: dataOf(detail, 'raidCancelled'),
      }));
    },
    async raidStarting(detail: RaidDetail): Promise<void> {
      await guard(sendTo(rosterIds(detail), {
        title: 'Raid starting soon',
        body: `${label(detail)} starts in 30 minutes.`,
        data: dataOf(detail, 'raidStarting'),
      }));
    },
  };
}

export type NotificationService = ReturnType<typeof createNotificationService>;
