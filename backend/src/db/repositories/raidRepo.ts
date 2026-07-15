import type { Kysely } from 'kysely';
import type { DB } from '../schema';

export type Difficulty = 'SM' | 'HM' | 'NiM';
export type Faction = 'Republic' | 'Empire';
export type RaidStatus = 'OPEN' | 'RUNNING' | 'FINISHED' | 'CANCELLED';

export type RaidRecord = {
  id: number; codigo: string; operation: string; difficulty: Difficulty; size: number;
  faction: Faction; minimum_tier: number; check_composition: boolean;
  slots_tank: number; slots_heal: number; slots_dps: number; notes: string | null;
  start_at: Date; status: RaidStatus; created_by: number;
};
export type NewRaid = Omit<RaidRecord, 'id' | 'status'>;

export interface RaidRepo {
  create(r: NewRaid): Promise<RaidRecord>;
  findById(id: number): Promise<RaidRecord | null>;
  findByCodigo(codigo: string): Promise<RaidRecord | null>;
  list(f: { status?: string; faction?: string; operation?: string }): Promise<RaidRecord[]>;
  update(id: number, patch: Partial<NewRaid>): Promise<void>;
  updateStatus(id: number, status: RaidStatus): Promise<void>;
  delete(id: number): Promise<void>;
}

const COLS = ['id', 'codigo', 'operation', 'difficulty', 'size', 'faction', 'minimum_tier', 'check_composition', 'slots_tank', 'slots_heal', 'slots_dps', 'notes', 'start_at', 'status', 'created_by'] as const;

const norm = (row: any): RaidRecord => ({ ...row, check_composition: !!row.check_composition, start_at: new Date(row.start_at) });

export function createRaidRepo(db: Kysely<DB>): RaidRepo {
  return {
    async create(r) {
      const res = await db.insertInto('raids').values({ ...r, check_composition: r.check_composition ? 1 : 0, status: 'OPEN', updated_at: new Date() }).executeTakeFirstOrThrow();
      const row = await db.selectFrom('raids').select(COLS).where('id', '=', Number(res.insertId)).executeTakeFirstOrThrow();
      return norm(row);
    },
    async findById(id) {
      const row = await db.selectFrom('raids').select(COLS).where('id', '=', id).executeTakeFirst();
      return row ? norm(row) : null;
    },
    async findByCodigo(codigo) {
      const row = await db.selectFrom('raids').select(COLS).where('codigo', '=', codigo).executeTakeFirst();
      return row ? norm(row) : null;
    },
    async list(f) {
      let q = db.selectFrom('raids').select(COLS).orderBy('start_at');
      if (f.status) q = q.where('status', '=', f.status as RaidStatus);
      if (f.faction) q = q.where('faction', '=', f.faction as Faction);
      if (f.operation) q = q.where('operation', '=', f.operation);
      return (await q.execute()).map(norm);
    },
    async update(id, patch) {
      const { check_composition, ...rest } = patch;
      const set = { ...rest, updated_at: new Date(), ...(check_composition !== undefined ? { check_composition: check_composition ? 1 : 0 } : {}) };
      await db.updateTable('raids').set(set).where('id', '=', id).execute();
    },
    async updateStatus(id, status) {
      await db.updateTable('raids').set({ status, updated_at: new Date() }).where('id', '=', id).execute();
    },
    async delete(id) {
      await db.deleteFrom('raids').where('id', '=', id).execute();
    },
  };
}
