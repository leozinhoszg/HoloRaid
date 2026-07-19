import type { Kysely } from 'kysely';
import type { DB } from '../schema';

export type CompletedBossRow = {
  boss_id: number; operation: string; boss: string;
  difficulty: 'Veteran' | 'Master' | null; type: 'boss' | 'timer' | 'lair'; points: number; completed_at: Date;
};

export interface UserBossRepo {
  listBossIds(usuarioId: number): Promise<number[]>;
  insertMany(usuarioId: number, bossIds: number[]): Promise<void>;
  deleteOne(usuarioId: number, bossId: number): Promise<void>;
  listWithBoss(usuarioId: number): Promise<CompletedBossRow[]>;
}

export function createUserBossRepo(db: Kysely<DB>): UserBossRepo {
  return {
    async listBossIds(usuarioId) {
      const rows = await db.selectFrom('usuario_bosses').select('boss_id').where('usuario_id', '=', usuarioId).execute();
      return rows.map((r) => r.boss_id);
    },
    async insertMany(usuarioId, bossIds) {
      if (bossIds.length === 0) return;
      await db.insertInto('usuario_bosses')
        .values(bossIds.map((boss_id) => ({ usuario_id: usuarioId, boss_id, completed_at: new Date() })))
        .execute();
    },
    async deleteOne(usuarioId, bossId) {
      await db.deleteFrom('usuario_bosses')
        .where('usuario_id', '=', usuarioId).where('boss_id', '=', bossId).execute();
    },
    async listWithBoss(usuarioId) {
      const rows = await db.selectFrom('usuario_bosses')
        .innerJoin('bosses', 'bosses.id', 'usuario_bosses.boss_id')
        .select(['usuario_bosses.boss_id as boss_id', 'bosses.operation', 'bosses.boss', 'bosses.difficulty', 'bosses.type', 'bosses.points', 'usuario_bosses.completed_at'])
        .where('usuario_bosses.usuario_id', '=', usuarioId)
        .orderBy('bosses.operation')
        .execute();
      return rows as CompletedBossRow[];
    },
  };
}
