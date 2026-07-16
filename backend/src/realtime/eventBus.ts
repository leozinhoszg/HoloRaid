import type { RaidBroadcaster } from './broadcaster';
import type { RaidDetail } from '../modules/raids/raids.service';
import { logger } from '../common/logger/logger';

export function createRaidEventBus(...listeners: RaidBroadcaster[]): RaidBroadcaster {
  const safe = (fn: () => void) => {
    try { fn(); } catch (err) { logger.error({ err }, 'RaidEventBus: ouvinte falhou'); }
  };
  return {
    raidCreated(detail: RaidDetail) { for (const l of listeners) safe(() => l.raidCreated(detail)); },
    raidUpdated(detail, event) { for (const l of listeners) safe(() => l.raidUpdated(detail, event)); },
    raidRemoved(id) { for (const l of listeners) safe(() => l.raidRemoved(id)); },
  };
}
