import type { Kysely } from 'kysely';
import type { DB } from '../schema';

export type Role = 'Tank' | 'Healer' | 'DPS';
export type PlayerStatus = 'confirmed' | 'waitlist';
export type RaidPlayerRecord = {
  id: number; raid_id: number; usuario_id: number; personagem_id: number;
  role: Role; status: PlayerStatus; joined_at: Date;
};
export type RosterRow = {
  usuario_id: number; username: string; avatar: string | null; personagem_id: number;
  nome: string; classe: string; especializacao: string | null; role: Role;
  item_level: number; total_points: number; status: PlayerStatus; joined_at: Date;
};

export interface RaidPlayerRepo {
  create(row: Omit<RaidPlayerRecord, 'id'>): Promise<void>;
  findByRaidAndUser(raidId: number, usuarioId: number): Promise<RaidPlayerRecord | null>;
  listByRaid(raidId: number): Promise<RaidPlayerRecord[]>;
  listRoster(raidId: number): Promise<RosterRow[]>;
  existsByPersonagem(personagemId: number): Promise<boolean>;
  updateStatus(id: number, status: PlayerStatus): Promise<void>;
  deleteByRaidAndUser(raidId: number, usuarioId: number): Promise<void>;
}

const COLS = ['id', 'raid_id', 'usuario_id', 'personagem_id', 'role', 'status', 'joined_at'] as const;
const normP = (r: any): RaidPlayerRecord => ({ ...r, joined_at: new Date(r.joined_at) });

export function createRaidPlayerRepo(db: Kysely<DB>): RaidPlayerRepo {
  return {
    async create(row) {
      await db.insertInto('raid_players').values(row).execute();
    },
    async findByRaidAndUser(raidId, usuarioId) {
      const r = await db.selectFrom('raid_players').select(COLS).where('raid_id', '=', raidId).where('usuario_id', '=', usuarioId).executeTakeFirst();
      return r ? normP(r) : null;
    },
    async listByRaid(raidId) {
      const rows = await db.selectFrom('raid_players').select(COLS).where('raid_id', '=', raidId).orderBy('joined_at').execute();
      return rows.map(normP);
    },
    async listRoster(raidId) {
      const rows = await db.selectFrom('raid_players')
        .innerJoin('personagens', 'personagens.id', 'raid_players.personagem_id')
        .innerJoin('usuarios', 'usuarios.id', 'raid_players.usuario_id')
        .select([
          'raid_players.usuario_id as usuario_id', 'usuarios.username as username', 'usuarios.avatar as avatar',
          'raid_players.personagem_id as personagem_id', 'personagens.nome as nome', 'personagens.classe as classe',
          'personagens.especializacao as especializacao', 'raid_players.role as role', 'personagens.item_level as item_level',
          'usuarios.total_points as total_points', 'raid_players.status as status', 'raid_players.joined_at as joined_at',
        ])
        .where('raid_players.raid_id', '=', raidId).orderBy('raid_players.joined_at').execute();
      return rows.map((r: any) => ({ ...r, joined_at: new Date(r.joined_at) })) as RosterRow[];
    },
    async existsByPersonagem(personagemId) {
      const r = await db.selectFrom('raid_players').select('id')
        .where('personagem_id', '=', personagemId).limit(1).executeTakeFirst();
      return !!r;
    },
    async updateStatus(id, status) {
      await db.updateTable('raid_players').set({ status }).where('id', '=', id).execute();
    },
    async deleteByRaidAndUser(raidId, usuarioId) {
      await db.deleteFrom('raid_players').where('raid_id', '=', raidId).where('usuario_id', '=', usuarioId).execute();
    },
  };
}
