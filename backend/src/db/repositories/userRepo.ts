import type { Kysely } from 'kysely';
import type { DB } from '../schema';

export type Role = 'user' | 'admin';
export type UserRecord = {
  id: number; discord_id: string; username: string;
  nickname: string | null; avatar: string | null; email: string | null; role: Role;
  push_enabled: boolean;
  total_points: number;
};
export type UpsertUser = {
  discord_id: string; username: string;
  nickname: string | null; avatar: string | null; email: string | null; role: Role;
};

export interface UserRepo {
  upsertByDiscordId(p: UpsertUser): Promise<UserRecord>;
  findById(id: number): Promise<UserRecord | null>;
  findByIds(ids: number[]): Promise<UserRecord[]>;
  updateRole(id: number, role: Role): Promise<void>;
  setPushEnabled(id: number, enabled: boolean): Promise<void>;
  updateTotalPoints(id: number, total: number): Promise<void>;
  list(): Promise<UserRecord[]>;
}

const COLS = ['id', 'discord_id', 'username', 'nickname', 'avatar', 'email', 'role', 'push_enabled', 'total_points'] as const;

const norm = (row: any): UserRecord => ({ ...row, push_enabled: !!row.push_enabled });

export function createUserRepo(db: Kysely<DB>): UserRepo {
  return {
    async upsertByDiscordId(p) {
      await db
        .insertInto('usuarios')
        .values({ ...p, updated_at: new Date() })
        .onDuplicateKeyUpdate({
          username: p.username, nickname: p.nickname, avatar: p.avatar,
          email: p.email, updated_at: new Date(),
        })
        .execute();
      const row = await db.selectFrom('usuarios').select(COLS)
        .where('discord_id', '=', p.discord_id).executeTakeFirstOrThrow();
      return norm(row);
    },
    async findById(id) {
      const row = await db.selectFrom('usuarios').select(COLS).where('id', '=', id).executeTakeFirst();
      return row ? norm(row) : null;
    },
    async findByIds(ids) {
      if (!ids.length) return [];
      const rows = await db.selectFrom('usuarios').select(COLS).where('id', 'in', ids).execute();
      return rows.map(norm);
    },
    async updateRole(id, role) {
      await db.updateTable('usuarios').set({ role, updated_at: new Date() }).where('id', '=', id).execute();
    },
    async setPushEnabled(id, enabled) {
      await db.updateTable('usuarios').set({ push_enabled: enabled ? 1 : 0, updated_at: new Date() }).where('id', '=', id).execute();
    },
    async updateTotalPoints(id, total) {
      await db.updateTable('usuarios').set({ total_points: total, updated_at: new Date() }).where('id', '=', id).execute();
    },
    async list() {
      const rows = await db.selectFrom('usuarios').select(COLS).orderBy('id').execute();
      return rows.map(norm);
    },
  };
}
