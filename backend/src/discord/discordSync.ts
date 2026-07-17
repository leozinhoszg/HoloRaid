import type { RaidBroadcaster } from '../realtime/broadcaster';
import type { RaidDetail } from '../modules/raids/raids.service';
import type { DiscordGateway, PostOpts, AllowedMentions } from './gateway';
import type { GuildConfigRepo } from '../db/repositories/guildConfigRepo';
import type { RaidDiscordMessageRepo } from '../db/repositories/raidDiscordMessageRepo';
import { buildRaidEmbed } from './embed';
import { logger } from '../common/logger/logger';

type Deps = {
  gateway: DiscordGateway;
  guildConfigRepo: GuildConfigRepo;
  msgRepo: RaidDiscordMessageRepo;
  appPublicUrl: string;
};

const NO_PING: AllowedMentions = { parse: [] };
const HERE_PING: AllowedMentions = { parse: ['everyone'] };

export function createDiscordSyncCore(deps: Deps) {
  return {
    async onCreated(detail: RaidDetail): Promise<void> {
      const embed = buildRaidEmbed(detail, deps.appPublicUrl);
      const opts: PostOpts = detail.disable_mentions
        ? { allowedMentions: NO_PING }
        : { content: '@here', allowedMentions: HERE_PING };
      for (const g of await deps.guildConfigRepo.list()) {
        try {
          const messageId = await deps.gateway.postEmbed(g.raid_channel_id, embed, opts);
          await deps.msgRepo.create({ raid_id: detail.id, guild_id: g.guild_id, channel_id: g.raid_channel_id, message_id: messageId });
        } catch (err) { logger.error({ err, guild: g.guild_id }, 'discord: post falhou'); }
      }
    },
    async onUpdated(detail: RaidDetail, event: string): Promise<void> {
      const embed = buildRaidEmbed(detail, deps.appPublicUrl);
      for (const m of await deps.msgRepo.listByRaid(detail.id)) {
        try {
          await deps.gateway.editEmbed(m.channel_id, m.message_id, embed);
          if (event === 'raidFull') await deps.gateway.postMessage(m.channel_id, '🔴 Raid full — starting soon!', NO_PING);
        } catch (err) { logger.error({ err, channel: m.channel_id }, 'discord: edit falhou'); }
      }
    },
    async onRemoved(id: number): Promise<void> {
      for (const m of await deps.msgRepo.listByRaid(id)) {
        try { await deps.gateway.deleteMessage(m.channel_id, m.message_id); }
        catch (err) { logger.error({ err, channel: m.channel_id }, 'discord: delete falhou'); }
      }
      await deps.msgRepo.deleteByRaid(id);
    },
    async reportTo(detail: RaidDetail, guildId: string, channelId: string): Promise<'posted' | 'exists' | 'failed'> {
      const already = (await deps.msgRepo.listByRaid(detail.id)).some((m) => m.channel_id === channelId);
      if (already) return 'exists';
      try {
        const messageId = await deps.gateway.postEmbed(channelId, buildRaidEmbed(detail, deps.appPublicUrl));
        await deps.msgRepo.create({ raid_id: detail.id, guild_id: guildId, channel_id: channelId, message_id: messageId });
        return 'posted';
      } catch (err) {
        logger.error({ err, channel: channelId }, 'discord: report falhou');
        return 'failed';
      }
    },
  };
}

export function createDiscordSync(deps: Deps): RaidBroadcaster & {
  reportTo(detail: RaidDetail, guildId: string, channelId: string): Promise<'posted' | 'exists' | 'failed'>;
} {
  const core = createDiscordSyncCore(deps);
  const run = (p: Promise<unknown>) => { p.catch((err) => logger.error({ err }, 'discord sync falhou')); };
  return {
    raidCreated(detail) { run(core.onCreated(detail)); },
    raidUpdated(detail, event) { run(core.onUpdated(detail, event)); },
    raidRemoved(id) { run(core.onRemoved(id)); },
    reportTo: core.reportTo,
  };
}
