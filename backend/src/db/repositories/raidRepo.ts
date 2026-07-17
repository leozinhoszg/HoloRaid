import { sql, type Kysely } from 'kysely';
import type { DB } from '../schema';

export type Difficulty = 'SM' | 'HM' | 'NiM';
export type Faction = 'Republic' | 'Empire';
export type RaidStatus = 'OPEN' | 'RUNNING' | 'FINISHED' | 'CANCELLED';

export type RaidRecord = {
  id: number; codigo: string; operation: string; difficulty: Difficulty; size: number;
  faction: Faction; minimum_tier: number; check_composition: boolean; disable_mentions: boolean;
  slots_tank: number; slots_heal: number; slots_dps: number; notes: string | null;
  start_at: Date; status: RaidStatus; created_by: number;
};
export type NewRaid = Omit<RaidRecord, 'id' | 'status' | 'disable_mentions'> & { disable_mentions?: boolean };

export type MyRaid = {
  id: number; codigo: string; operation: string; difficulty: Difficulty; size: number;
  faction: Faction; start_at: Date; status: RaidStatus;
  created: boolean; myStatus: 'confirmed' | 'waitlist' | null;
};

export interface RaidRepo {
  create(r: NewRaid): Promise<RaidRecord>;
  findById(id: number): Promise<RaidRecord | null>;
  findByCodigo(codigo: string): Promise<RaidRecord | null>;
  list(f: { status?: string; faction?: string; operation?: string }): Promise<RaidRecord[]>;
  listForUser(userId: number): Promise<MyRaid[]>;
  update(id: number, patch: Partial<NewRaid>): Promise<void>;
  updateStatus(id: number, status: RaidStatus): Promise<void>;
  listStartingSoon(withinMinutes: number): Promise<RaidRecord[]>;
  markStartingNotified(id: number): Promise<void>;
  delete(id: number): Promise<void>;
}

const COLS = ['id', 'codigo', 'operation', 'difficulty', 'size', 'faction', 'minimum_tier', 'check_composition', 'disable_mentions', 'slots_tank', 'slots_heal', 'slots_dps', 'notes', 'start_at', 'status', 'created_by'] as const;

const norm = (row: any): RaidRecord => ({ ...row, check_composition: !!row.check_composition, disable_mentions: !!row.disable_mentions, start_at: new Date(row.start_at) });

export function createRaidRepo(db: Kysely<DB>): RaidRepo {
  return {
    async create(r) {
      const res = await db.insertInto('raids').values({ ...r, check_composition: r.check_composition ? 1 : 0, disable_mentions: r.disable_mentions ? 1 : 0, status: 'OPEN', updated_at: new Date() }).executeTakeFirstOrThrow();
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
    // Raids do usuário: criadas (created_by) OU entradas (raid_players). Uma linha por raid
    // graças ao UNIQUE (raid_id, usuario_id); myStatus null quando só criou.
    async listForUser(userId) {
      const rows = await db.selectFrom('raids as r')
        .leftJoin('raid_players as rp', (join) =>
          join.onRef('rp.raid_id', '=', 'r.id').on('rp.usuario_id', '=', userId))
        .select([
          'r.id as id', 'r.codigo as codigo', 'r.operation as operation', 'r.difficulty as difficulty',
          'r.size as size', 'r.faction as faction', 'r.start_at as start_at', 'r.status as status',
          sql<number>`(r.created_by = ${userId})`.as('created'),
          'rp.status as my_status',
        ])
        .where((eb) => eb.or([eb('r.created_by', '=', userId), eb('rp.usuario_id', '=', userId)]))
        .orderBy('r.start_at', 'desc')
        .execute();
      return rows.map((row: any) => ({
        id: row.id, codigo: row.codigo, operation: row.operation, difficulty: row.difficulty,
        size: row.size, faction: row.faction, start_at: new Date(row.start_at), status: row.status,
        created: !!Number(row.created), myStatus: row.my_status ?? null,
      }));
    },
    async update(id, patch) {
      const { check_composition, disable_mentions, ...rest } = patch;
      const set = {
        ...rest,
        updated_at: new Date(),
        ...(check_composition !== undefined ? { check_composition: check_composition ? 1 : 0 } : {}),
        ...(disable_mentions !== undefined ? { disable_mentions: disable_mentions ? 1 : 0 } : {}),
      };
      await db.updateTable('raids').set(set).where('id', '=', id).execute();
    },
    async updateStatus(id, status) {
      await db.updateTable('raids').set({ status, updated_at: new Date() }).where('id', '=', id).execute();
    },
    // OPEN, ainda não notificada, começando entre agora e agora+withinMinutes.
    async listStartingSoon(withinMinutes) {
      const now = new Date();
      const until = new Date(now.getTime() + withinMinutes * 60_000);
      const rows = await db.selectFrom('raids').select(COLS)
        .where('status', '=', 'OPEN')
        .where('starting_notified_at', 'is', null)
        .where('start_at', '>=', now)
        .where('start_at', '<=', until)
        .execute();
      return rows.map(norm);
    },
    async markStartingNotified(id) {
      await db.updateTable('raids').set({ starting_notified_at: new Date(), updated_at: new Date() }).where('id', '=', id).execute();
    },
    async delete(id) {
      await db.deleteFrom('raids').where('id', '=', id).execute();
    },
  };
}
