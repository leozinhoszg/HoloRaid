import type { Kysely } from 'kysely';
import type { DB } from '../schema';

export type Role = 'user' | 'admin';
export type UserRecord = {
  id: number; discord_id: string; username: string;
  nickname: string | null; avatar: string | null; email: string | null; role: Role;
};
export type UpsertUser = {
  discord_id: string; username: string;
  nickname: string | null; avatar: string | null; email: string | null; role: Role;
};

export interface UserRepo {
  upsertByDiscordId(p: UpsertUser): Promise<UserRecord>;
  findById(id: number): Promise<UserRecord | null>;
  updateRole(id: number, role: Role): Promise<void>;
  list(): Promise<UserRecord[]>;
}

const COLS = ['id', 'discord_id', 'username', 'nickname', 'avatar', 'email', 'role'] as const;

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
      return row as UserRecord;
    },
    async findById(id) {
      const row = await db.selectFrom('usuarios').select(COLS).where('id', '=', id).executeTakeFirst();
      return (row as UserRecord) ?? null;
    },
    async updateRole(id, role) {
      await db.updateTable('usuarios').set({ role, updated_at: new Date() }).where('id', '=', id).execute();
    },
    async list() {
      const rows = await db.selectFrom('usuarios').select(COLS).orderBy('id').execute();
      return rows as UserRecord[];
    },
  };
}
