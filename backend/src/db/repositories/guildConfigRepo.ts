import type { Kysely } from 'kysely';
import type { DB } from '../schema';

export type GuildConfig = { guild_id: string; raid_channel_id: string };

export interface GuildConfigRepo {
  upsert(guild_id: string, raid_channel_id: string): Promise<void>;
  list(): Promise<GuildConfig[]>;
  findByGuild(guild_id: string): Promise<GuildConfig | null>;
}

export function createGuildConfigRepo(db: Kysely<DB>): GuildConfigRepo {
  return {
    async upsert(guild_id, raid_channel_id) {
      await db.insertInto('guild_config')
        .values({ guild_id, raid_channel_id, updated_at: new Date() })
        .onDuplicateKeyUpdate({ raid_channel_id, updated_at: new Date() })
        .execute();
    },
    async list() {
      return db.selectFrom('guild_config').select(['guild_id', 'raid_channel_id']).execute();
    },
    async findByGuild(guild_id) {
      const r = await db.selectFrom('guild_config').select(['guild_id', 'raid_channel_id']).where('guild_id', '=', guild_id).executeTakeFirst();
      return r ?? null;
    },
  };
}
