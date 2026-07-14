import type { Kysely } from 'kysely';
import type { DB } from '../schema';

export type Faccao = 'Republic' | 'Empire';
export type Role = 'Tank' | 'Healer' | 'DPS';
export type PersonagemRecord = {
  id: number; usuario_id: number; nome: string; faccao: Faccao; classe: string;
  especializacao: string | null; role: Role; origin_story: string | null;
  item_level: number; total_points: number;
};
export type PersonagemInput = Omit<PersonagemRecord, 'id' | 'total_points'>;

export interface PersonagemRepo {
  create(p: PersonagemInput): Promise<PersonagemRecord>;
  findById(id: number): Promise<PersonagemRecord | null>;
  findByUsuario(usuarioId: number): Promise<PersonagemRecord[]>;
  update(id: number, patch: Partial<PersonagemInput>): Promise<void>;
  delete(id: number): Promise<void>;
  updateTotalPoints(id: number, total: number): Promise<void>;
}

const COLS = ['id', 'usuario_id', 'nome', 'faccao', 'classe', 'especializacao', 'role', 'origin_story', 'item_level', 'total_points'] as const;

export function createPersonagemRepo(db: Kysely<DB>): PersonagemRepo {
  return {
    async create(p) {
      const res = await db.insertInto('personagens').values({ ...p, total_points: 0, updated_at: new Date() }).executeTakeFirstOrThrow();
      const id = Number(res.insertId);
      const row = await db.selectFrom('personagens').select(COLS).where('id', '=', id).executeTakeFirstOrThrow();
      return row as PersonagemRecord;
    },
    async findById(id) {
      const row = await db.selectFrom('personagens').select(COLS).where('id', '=', id).executeTakeFirst();
      return (row as PersonagemRecord) ?? null;
    },
    async findByUsuario(usuarioId) {
      const rows = await db.selectFrom('personagens').select(COLS).where('usuario_id', '=', usuarioId).orderBy('id').execute();
      return rows as PersonagemRecord[];
    },
    async update(id, patch) {
      await db.updateTable('personagens').set({ ...patch, updated_at: new Date() }).where('id', '=', id).execute();
    },
    async delete(id) {
      await db.deleteFrom('personagens').where('id', '=', id).execute();
    },
    async updateTotalPoints(id, total) {
      await db.updateTable('personagens').set({ total_points: total, updated_at: new Date() }).where('id', '=', id).execute();
    },
  };
}
