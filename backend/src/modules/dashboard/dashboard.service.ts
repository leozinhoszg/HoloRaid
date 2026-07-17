import type { Kysely } from 'kysely';
import type { DB } from '../../db/schema';

export type DashboardStats = {
  raids: { today: number; week: number; month: number };
  participantsThisMonth: number;
  topOperations: { operation: string; count: number }[];
  topPlayers: { usuario_id: number; username: string; avatar: string | null; raids: number }[];
};
export type Boundaries = { today: Date; week: Date; month: Date };

export function createDashboardService(deps: { db: Kysely<DB> }) {
  const { db } = deps;

  // COUNT de raids não-canceladas com start_at >= from
  async function countRaidsSince(from: Date): Promise<number> {
    const row = await db.selectFrom('raids')
      .select((eb) => eb.fn.countAll<string>().as('n'))
      .where('status', '!=', 'CANCELLED')
      .where('start_at', '>=', from)
      .executeTakeFirstOrThrow();
    return Number(row.n);
  }

  return {
    async getStats(b: Boundaries): Promise<DashboardStats> {
      const [today, week, month] = await Promise.all([
        countRaidsSince(b.today), countRaidsSince(b.week), countRaidsSince(b.month),
      ]);

      // participantes distintos em raids não-canceladas do mês
      const partRow = await db.selectFrom('raid_players')
        .innerJoin('raids', 'raids.id', 'raid_players.raid_id')
        .select((eb) => eb.fn.count<string>('raid_players.usuario_id').distinct().as('n'))
        .where('raids.status', '!=', 'CANCELLED')
        .where('raids.start_at', '>=', b.month)
        .executeTakeFirstOrThrow();

      // top 5 operations por nº de raids não-canceladas (all-time)
      const ops = await db.selectFrom('raids')
        .select((eb) => ['operation', eb.fn.countAll<string>().as('count')])
        .where('status', '!=', 'CANCELLED')
        .groupBy('operation').orderBy('count', 'desc').limit(5)
        .execute();

      // top 5 jogadores por nº de inscrições (all-time)
      const players = await db.selectFrom('raid_players')
        .innerJoin('usuarios', 'usuarios.id', 'raid_players.usuario_id')
        .select((eb) => [
          'raid_players.usuario_id as usuario_id', 'usuarios.username as username', 'usuarios.avatar as avatar',
          eb.fn.countAll<string>().as('raids'),
        ])
        .groupBy(['raid_players.usuario_id', 'usuarios.username', 'usuarios.avatar'])
        .orderBy('raids', 'desc').limit(5)
        .execute();

      return {
        raids: { today, week, month },
        participantsThisMonth: Number(partRow.n),
        topOperations: ops.map((o) => ({ operation: o.operation, count: Number(o.count) })),
        topPlayers: players.map((p) => ({ usuario_id: p.usuario_id, username: p.username, avatar: p.avatar, raids: Number(p.raids) })),
      };
    },
  };
}

export type DashboardService = ReturnType<typeof createDashboardService>;
