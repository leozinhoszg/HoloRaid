import type { Kysely } from 'kysely';
import type { DB } from '../schema';

export type RefreshRecord = {
  id: number; usuario_id: number; family_id: string; expires_at: Date; revoked_at: Date | null;
};
export type NewRefresh = {
  usuario_id: number; token_hash: string; family_id: string; device: string | null; expires_at: Date;
};

export interface RefreshTokenRepo {
  create(row: NewRefresh): Promise<void>;
  findByHash(hash: string): Promise<RefreshRecord | null>;
  revokeById(id: number): Promise<void>;
  revokeFamily(familyId: string): Promise<void>;
}

export function createRefreshTokenRepo(db: Kysely<DB>): RefreshTokenRepo {
  return {
    async create(row) {
      await db.insertInto('refresh_tokens').values(row).execute();
    },
    async findByHash(hash) {
      const row = await db.selectFrom('refresh_tokens')
        .select(['id', 'usuario_id', 'family_id', 'expires_at', 'revoked_at'])
        .where('token_hash', '=', hash).executeTakeFirst();
      return (row as RefreshRecord) ?? null;
    },
    async revokeById(id) {
      await db.updateTable('refresh_tokens').set({ revoked_at: new Date() }).where('id', '=', id).execute();
    },
    async revokeFamily(familyId) {
      await db.updateTable('refresh_tokens').set({ revoked_at: new Date() })
        .where('family_id', '=', familyId).where('revoked_at', 'is', null).execute();
    },
  };
}
