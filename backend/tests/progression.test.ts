import { makeFakeUserRepo, makeFakeBossRepo, makeFakeUserBossRepo } from './fakes/fakeRepos';
import { createProgressionService } from '../src/modules/progression/progression.service';

async function setup() {
  const userRepo = makeFakeUserRepo();
  const bossRepo = makeFakeBossRepo();
  const userBossRepo = makeFakeUserBossRepo(bossRepo);
  const u = await userRepo.upsertByDiscordId({ discord_id: 'd1', username: 'Kira', nickname: null, avatar: null, email: null, role: 'user' });
  const svc = createProgressionService({ userRepo, bossRepo, userBossRepo });
  return { svc, userRepo, uid: u.id };
}

describe('progression (conta)', () => {
  it('award soma pontos e é idempotente', async () => {
    const { svc, userRepo, uid } = await setup();
    const r1 = await svc.award(uid, [1, 2, 3]);
    expect(r1.awarded).toBe(3);
    expect(r1.total_points).toBe(3);
    const r2 = await svc.award(uid, [1, 2, 3]);
    expect(r2.awarded).toBe(0);
    expect(r2.total_points).toBe(3);
    expect((await userRepo.findById(uid))!.total_points).toBe(3);
  });

  it('revoke recalcula o total', async () => {
    const { svc, uid } = await setup();
    await svc.award(uid, [1, 2, 3]);
    expect((await svc.revoke(uid, 2)).total_points).toBe(2);
  });

  it('history lista os bosses concluídos', async () => {
    const { svc, uid } = await setup();
    await svc.award(uid, [1, 2]);
    expect(await svc.history(uid)).toHaveLength(2);
  });

  it('ignora boss_id inexistente', async () => {
    const { svc, uid } = await setup();
    const r = await svc.award(uid, [999999]);
    expect(r.awarded).toBe(0);
    expect(r.total_points).toBe(0);
  });
});
