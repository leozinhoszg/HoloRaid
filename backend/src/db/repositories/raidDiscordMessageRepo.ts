import type { Kysely } from 'kysely';
import type { DB } from '../schema';

export type RaidDiscordMessage = { id: number; raid_id: number; guild_id: string; channel_id: string; message_id: string };
export type NewRaidDiscordMessage = Omit<RaidDiscordMessage, 'id'>;

export interface RaidDiscordMessageRepo {
  create(row: NewRaidDiscordMessage): Promise<void>;
  listByRaid(raid_id: number): Promise<RaidDiscordMessage[]>;
  deleteByRaid(raid_id: number): Promise<void>;
}

const COLS = ['id', 'raid_id', 'guild_id', 'channel_id', 'message_id'] as const;

export function createRaidDiscordMessageRepo(db: Kysely<DB>): RaidDiscordMessageRepo {
  return {
    async create(row) {
      await db.insertInto('raid_discord_messages').values(row).execute();
    },
    async listByRaid(raid_id) {
      const rows = await db.selectFrom('raid_discord_messages').select(COLS).where('raid_id', '=', raid_id).execute();
      return rows as RaidDiscordMessage[];
    },
    async deleteByRaid(raid_id) {
      await db.deleteFrom('raid_discord_messages').where('raid_id', '=', raid_id).execute();
    },
  };
}
