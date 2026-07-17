import 'dotenv/config';
import { db } from '../src/db/db';
import { createDashboardService } from '../src/modules/dashboard/dashboard.service';
import { createUserRepo } from '../src/db/repositories/userRepo';
import { createPersonagemRepo } from '../src/db/repositories/personagemRepo';
import { createRaidRepo } from '../src/db/repositories/raidRepo';
import { createRaidPlayerRepo } from '../src/db/repositories/raidPlayerRepo';

const svc = createDashboardService({ db });
const userRepo = createUserRepo(db);
const personagemRepo = createPersonagemRepo(db);
const raidRepo = createRaidRepo(db);
const raidPlayerRepo = createRaidPlayerRepo(db);

const MARK = 'DASH7';
const created = { users: [] as number[], raids: [] as number[] };

async function mkUser(tag: string) {
  const u = await userRepo.upsertByDiscordId({ discord_id: `${MARK}-${tag}`, username: `${MARK}_${tag}`, nickname: null, avatar: null, email: null, role: 'user' });
  created.users.push(u.id); return u;
}
async function mkRaid(operation: string, startAt: Date, createdBy: number, status?: 'CANCELLED') {
  const r = await raidRepo.create({ codigo: `${MARK}${created.raids.length}`, operation, difficulty: 'HM', size: 8, faction: 'Republic', minimum_tier: 0, check_composition: false, slots_tank: 2, slots_heal: 2, slots_dps: 4, notes: null, start_at: startAt, created_by: createdBy } as any);
  if (status) await raidRepo.updateStatus(r.id, status);
  created.raids.push(r.id); return r;
}

const onlyMark = (stats: any) => ({
  ...stats,
  topOperations: stats.topOperations.filter((o: any) => o.operation.startsWith(MARK)),
  topPlayers: stats.topPlayers.filter((p: any) => created.users.includes(p.usuario_id)),
});

afterAll(async () => {
  for (const id of created.raids) await raidRepo.delete(id);
  if (created.users.length) await db.deleteFrom('usuarios').where('id', 'in', created.users).execute();
  await db.destroy();
});

describe('DashboardService', () => {
  it('conta raids por faixa e ignora CANCELLED', async () => {
    const u = await mkUser('leader');
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const weekStart = new Date(todayStart.getTime() - 3 * 86400_000);

    await mkRaid(`${MARK}_Op`, new Date(todayStart.getTime() + 3600_000), u.id);
    await mkRaid(`${MARK}_Op`, new Date(todayStart.getTime() - 2 * 86400_000), u.id);
    await mkRaid(`${MARK}_Op`, new Date(todayStart.getTime() + 7200_000), u.id, 'CANCELLED');

    const b = { today: todayStart, week: weekStart, month: monthStart };
    const stats = await svc.getStats(b);

    expect(stats.raids.today).toBeGreaterThanOrEqual(1);
    // a CANCELLED de hoje NÃO soma: validamos via topOperations (isolado por MARK)
    const op = onlyMark(stats).topOperations.find((o: any) => o.operation === `${MARK}_Op`);
    expect(op!.count).toBe(2);
  });

  it('participantsThisMonth conta distintos e topPlayers ordena', async () => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const u1 = await mkUser('p1'); const u2 = await mkUser('p2');
    const c1 = await personagemRepo.create({ usuario_id: u1.id, nome: 'C1', faccao: 'Republic', classe: 'Guardian', especializacao: null, role: 'Tank', origin_story: null, item_level: 340 } as any);
    const c2 = await personagemRepo.create({ usuario_id: u2.id, nome: 'C2', faccao: 'Republic', classe: 'Guardian', especializacao: null, role: 'Tank', origin_story: null, item_level: 340 } as any);
    const rA = await mkRaid(`${MARK}_P`, new Date(todayStart.getTime() + 3600_000), u1.id);
    const rB = await mkRaid(`${MARK}_P`, new Date(todayStart.getTime() + 3600_000), u1.id);
    await raidPlayerRepo.create({ raid_id: rA.id, usuario_id: u1.id, personagem_id: c1.id, role: 'Tank', status: 'confirmed', joined_at: new Date() });
    await raidPlayerRepo.create({ raid_id: rB.id, usuario_id: u1.id, personagem_id: c1.id, role: 'Tank', status: 'confirmed', joined_at: new Date() });
    await raidPlayerRepo.create({ raid_id: rA.id, usuario_id: u2.id, personagem_id: c2.id, role: 'Tank', status: 'confirmed', joined_at: new Date() });

    const stats = await svc.getStats({ today: todayStart, week: monthStart, month: monthStart });
    expect(stats.participantsThisMonth).toBeGreaterThanOrEqual(2);

    const players = onlyMark(stats).topPlayers;
    const p1 = players.find((p: any) => p.usuario_id === u1.id);
    const p2 = players.find((p: any) => p.usuario_id === u2.id);
    expect(p1!.raids).toBe(2);
    expect(p2!.raids).toBe(1);
    expect(p1!.username).toBe(`${MARK}_p1`);
  });
});
