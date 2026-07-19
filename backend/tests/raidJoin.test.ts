import { makeFakeRaidRepo, makeFakeRaidPlayerRepo, makeFakePersonagemRepo, makeFakeUserRepo } from './fakes/fakeRepos';
import { createRaidJoinService } from '../src/modules/raids/raidJoin.service';

async function setup(opts: Partial<{ check: boolean; size: number; minTier: number; faction: 'Republic' | 'Empire' }> = {}) {
  const raidRepo = makeFakeRaidRepo();
  const userRepo = makeFakeUserRepo();
  const personagemRepo = makeFakePersonagemRepo();
  const raidPlayerRepo = makeFakeRaidPlayerRepo(personagemRepo, userRepo);
  const svc = createRaidJoinService({ raidRepo, raidPlayerRepo, personagemRepo, userRepo });
  const raid = await raidRepo.create({
    codigo: 'ABC12345', operation: 'Dread Palace', difficulty: 'HM', size: opts.size ?? 8, faction: opts.faction ?? 'Republic',
    minimum_tier: opts.minTier ?? 0, check_composition: opts.check ?? false, slots_tank: 2, slots_heal: 2, slots_dps: 4, notes: null,
    start_at: new Date('2026-08-01T20:30:00Z'), created_by: 99,
  });
  // helper para criar personagem de um usuário (Tier da CONTA 0 por padrão; ajuste via userRepo.updateTotalPoints)
  const mkChar = (uid: number, role: 'Tank' | 'Healer' | 'DPS', faccao: 'Republic' | 'Empire' = 'Republic') =>
    personagemRepo.create({ usuario_id: uid, nome: 'P' + uid, faccao, classe: role === 'Tank' ? 'Guardian' : role === 'Healer' ? 'Sage' : 'Sentinel', especializacao: null, role, origin_story: null, item_level: 340 });
  return { svc, raid, userRepo, personagemRepo, raidPlayerRepo, mkChar };
}

describe('RaidJoinService', () => {
  it('confirma quando há vaga (headcount)', async () => {
    const { svc, raid, mkChar } = await setup();
    const c = await mkChar(1, 'DPS');
    expect((await svc.join(1, raid.id, c.id)).status).toBe('confirmed');
  });

  it('rejeita facção diferente', async () => {
    const { svc, raid, mkChar } = await setup({ faction: 'Republic' });
    const c = await mkChar(1, 'DPS', 'Empire');
    await expect(svc.join(1, raid.id, c.id)).rejects.toThrow();
  });

  it('rejeita Tier abaixo do mínimo (conta sem pontos → Tier 0 < 1)', async () => {
    const { svc, raid, mkChar } = await setup({ minTier: 1 });
    const c = await mkChar(1, 'DPS'); // conta do uid 1 sem pontos → Tier 0
    await expect(svc.join(1, raid.id, c.id)).rejects.toThrow();
  });

  it('rejeita personagem de outro usuário (403)', async () => {
    const { svc, raid, mkChar } = await setup();
    const c = await mkChar(1, 'DPS');
    await expect(svc.join(2, raid.id, c.id)).rejects.toThrow();
  });

  it('excedente vai para waitlist (headcount) e auto-promove FIFO ao sair', async () => {
    const { svc, raid, raidPlayerRepo, mkChar } = await setup({ size: 8 });
    const chars = [];
    for (let u = 1; u <= 9; u++) chars.push(await mkChar(u, 'DPS'));
    for (let u = 1; u <= 8; u++) await svc.join(u, raid.id, chars[u - 1]!.id);
    await svc.join(9, raid.id, chars[8]!.id); // waitlist
    let p9 = await raidPlayerRepo.findByRaidAndUser(raid.id, 9);
    expect(p9!.status).toBe('waitlist');
    await svc.leave(1, raid.id); // abre vaga -> promove o 9 (único na waitlist)
    p9 = await raidPlayerRepo.findByRaidAndUser(raid.id, 9);
    expect(p9!.status).toBe('confirmed');
  });

  it('por role: enche a quota da role e manda o excedente daquela role p/ waitlist', async () => {
    const { svc, raid, mkChar } = await setup({ check: true, size: 8 }); // 2T/2H/4D
    const t1 = await mkChar(1, 'Tank'); const t2 = await mkChar(2, 'Tank'); const t3 = await mkChar(3, 'Tank');
    expect((await svc.join(1, raid.id, t1.id)).status).toBe('confirmed');
    expect((await svc.join(2, raid.id, t2.id)).status).toBe('confirmed');
    expect((await svc.join(3, raid.id, t3.id)).status).toBe('waitlist'); // 3º tank
    const d1 = await mkChar(4, 'DPS');
    expect((await svc.join(4, raid.id, d1.id)).status).toBe('confirmed'); // dps ainda tem vaga
  });
});

describe('leave retorna o promovido (#6)', () => {
  it('promove o primeiro da waitlist e retorna o usuario_id', async () => {
    const { svc, raid, mkChar } = await setup({ size: 1 });
    const c1 = await mkChar(10, 'DPS');
    const c2 = await mkChar(20, 'DPS');
    expect((await svc.join(10, raid.id, c1.id)).status).toBe('confirmed');
    expect((await svc.join(20, raid.id, c2.id)).status).toBe('waitlist');

    const res = await svc.leave(10, raid.id);
    expect(res.promoted).toBe(20);
  });

  it('sem ninguém na waitlist → promoted undefined', async () => {
    const { svc, raid, mkChar } = await setup({ size: 1 });
    const c1 = await mkChar(10, 'DPS');
    await svc.join(10, raid.id, c1.id);
    expect((await svc.leave(10, raid.id)).promoted).toBeUndefined();
  });
});
