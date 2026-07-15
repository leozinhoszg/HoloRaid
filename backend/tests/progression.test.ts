import { makeFakePersonagemRepo, makeFakeBossRepo, makeFakeCharacterBossRepo } from './fakes/fakeRepos';
import { createProgressionService } from '../src/modules/progression/progression.service';

async function setup() {
  const personagemRepo = makeFakePersonagemRepo();
  const bossRepo = makeFakeBossRepo();
  const charBossRepo = makeFakeCharacterBossRepo(bossRepo);
  const p = await personagemRepo.create({
    usuario_id: 1, nome: 'Kira', faccao: 'Republic', classe: 'Guardian',
    especializacao: null, role: 'Tank', origin_story: null, item_level: 340,
  });
  const svc = createProgressionService({ personagemRepo, bossRepo, charBossRepo });
  return { svc, personagemRepo, p };
}

describe('progression', () => {
  it('award soma pontos e é idempotente', async () => {
    const { svc, personagemRepo, p } = await setup();
    const r1 = await svc.award(p.id, [1, 2, 3]); // 3 bosses de 1 ponto
    expect(r1.awarded).toBe(3);
    expect(r1.total_points).toBe(3);
    const r2 = await svc.award(p.id, [1, 2, 3]); // repetido não duplica
    expect(r2.awarded).toBe(0);
    expect(r2.total_points).toBe(3);
    expect((await personagemRepo.findById(p.id))!.total_points).toBe(3);
  });

  it('revoke recalcula o total', async () => {
    const { svc, p } = await setup();
    await svc.award(p.id, [1, 2, 3]);
    const r = await svc.revoke(p.id, 2);
    expect(r.total_points).toBe(2);
  });

  it('history lista os bosses concluídos', async () => {
    const { svc, p } = await setup();
    await svc.award(p.id, [1, 2]);
    expect(await svc.history(p.id)).toHaveLength(2);
  });

  it('ignora boss_id inexistente', async () => {
    const { svc, p } = await setup();
    const r = await svc.award(p.id, [999999]);
    expect(r.awarded).toBe(0);
    expect(r.total_points).toBe(0);
  });
});
