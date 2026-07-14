import type { Kysely } from 'kysely';
import type { DB } from '../schema';

export type BossRecord = {
  id: number; operation: string; boss: string;
  difficulty: 'Veteran' | 'Master' | null; type: 'boss' | 'timer' | 'lair'; points: number;
};

export interface BossRepo {
  list(): Promise<BossRecord[]>;
  findByIds(ids: number[]): Promise<BossRecord[]>;
}

const COLS = ['id', 'operation', 'boss', 'difficulty', 'type', 'points'] as const;

export function createBossRepo(db: Kysely<DB>): BossRepo {
  return {
    async list() {
      const rows = await db.selectFrom('bosses').select(COLS).orderBy('id').execute();
      return rows as BossRecord[];
    },
    async findByIds(ids) {
      if (ids.length === 0) return [];
      const rows = await db.selectFrom('bosses').select(COLS).where('id', 'in', ids).execute();
      return rows as BossRecord[];
    },
  };
}
