import type { Kysely } from 'kysely';
import type { DB } from '../schema';

export type CompletedBossRow = {
  boss_id: number; operation: string; boss: string;
  difficulty: 'Veteran' | 'Master' | null; type: 'boss' | 'timer' | 'lair'; points: number; completed_at: Date;
};

export interface CharacterBossRepo {
  listBossIds(personagemId: number): Promise<number[]>;
  insertMany(personagemId: number, bossIds: number[]): Promise<void>;
  deleteOne(personagemId: number, bossId: number): Promise<void>;
  listWithBoss(personagemId: number): Promise<CompletedBossRow[]>;
}

export function createCharacterBossRepo(db: Kysely<DB>): CharacterBossRepo {
  return {
    async listBossIds(personagemId) {
      const rows = await db.selectFrom('character_bosses').select('boss_id').where('personagem_id', '=', personagemId).execute();
      return rows.map((r) => r.boss_id);
    },
    async insertMany(personagemId, bossIds) {
      if (bossIds.length === 0) return;
      await db.insertInto('character_bosses')
        .values(bossIds.map((boss_id) => ({ personagem_id: personagemId, boss_id, completed_at: new Date() })))
        .execute();
    },
    async deleteOne(personagemId, bossId) {
      await db.deleteFrom('character_bosses')
        .where('personagem_id', '=', personagemId).where('boss_id', '=', bossId).execute();
    },
    async listWithBoss(personagemId) {
      const rows = await db.selectFrom('character_bosses')
        .innerJoin('bosses', 'bosses.id', 'character_bosses.boss_id')
        .select(['character_bosses.boss_id as boss_id', 'bosses.operation', 'bosses.boss', 'bosses.difficulty', 'bosses.type', 'bosses.points', 'character_bosses.completed_at'])
        .where('character_bosses.personagem_id', '=', personagemId)
        .orderBy('bosses.operation')
        .execute();
      return rows as CompletedBossRow[];
    },
  };
}
