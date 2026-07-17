import type { Kysely } from 'kysely';
import type { DB } from '../schema';

export type Platform = 'android' | 'web';
export type DeviceToken = { id: number; usuario_id: number; token: string; platform: Platform };

export interface DeviceTokenRepo {
  upsert(usuario_id: number, token: string, platform: Platform): Promise<void>;
  listByUsuarios(ids: number[]): Promise<DeviceToken[]>;
  deleteByTokens(tokens: string[]): Promise<void>;
}

const COLS = ['id', 'usuario_id', 'token', 'platform'] as const;

export function createDeviceTokenRepo(db: Kysely<DB>): DeviceTokenRepo {
  return {
    // token é UNIQUE: o mesmo aparelho trocando de conta reatribui o usuario_id.
    async upsert(usuario_id, token, platform) {
      await db.insertInto('device_tokens')
        .values({ usuario_id, token, platform, updated_at: new Date() })
        .onDuplicateKeyUpdate({ usuario_id, platform, updated_at: new Date() })
        .execute();
    },
    async listByUsuarios(ids) {
      if (!ids.length) return [];
      const rows = await db.selectFrom('device_tokens').select(COLS).where('usuario_id', 'in', ids).execute();
      return rows as DeviceToken[];
    },
    async deleteByTokens(tokens) {
      if (!tokens.length) return;
      await db.deleteFrom('device_tokens').where('token', 'in', tokens).execute();
    },
  };
}
