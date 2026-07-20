import type { RaidRepo } from '../db/repositories/raidRepo';
import type { RaidService } from '../modules/raids/raids.service';
import type { NotificationService } from './notification.service';
import { logger } from '../common/logger/logger';

export const STARTING_SOON_MINUTES = 30;

type Deps = { raidRepo: RaidRepo; raidService: RaidService; notify: NotificationService };

// Notifica as raids que começam em <=30min e marca cada uma (idempotência:
// restart do processo ou tick duplicado não re-notificam).
export async function runStartingSoonTick(deps: Deps): Promise<number> {
  const raids = await deps.raidRepo.listStartingSoon(STARTING_SOON_MINUTES);
  let sent = 0;
  for (const r of raids) {
    try {
      const detail = await deps.raidService.getDetail(r.id);
      await deps.notify.raidStarting(detail);
      await deps.raidRepo.markStartingNotified(r.id);
      sent++;
    } catch (err) {
      logger.error({ err, raid: r.id }, 'push: reminder failed');
    }
  }
  return sent;
}

export function startScheduler(deps: Deps, intervalMs = 60_000): NodeJS.Timeout {
  const t = setInterval(() => {
    runStartingSoonTick(deps).catch((err) => logger.error({ err }, 'push: tick failed'));
  }, intervalMs);
  t.unref(); // não segura o processo
  return t;
}
