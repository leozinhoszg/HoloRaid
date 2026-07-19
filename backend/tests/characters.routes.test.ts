import request from 'supertest';
import { createApp } from '../src/app';
import { makeFakeUserRepo, makeFakePersonagemRepo, makeFakeBossRepo, makeFakeUserBossRepo, makeFakeRaidPlayerRepo } from './fakes/fakeRepos';
import { createCharacterService } from '../src/modules/characters/characters.service';
import { createProgressionService } from '../src/modules/progression/progression.service';
import { signAccessToken } from '../src/common/security/jwt';

beforeAll(() => {
  process.env.JWT_SECRET = 'z'.repeat(40);
  process.env.DISCORD_CLIENT_ID = 'CID';
  process.env.DISCORD_CLIENT_SECRET = 'SEC';
  process.env.DISCORD_REDIRECT_URI = 'http://localhost:3000/auth/callback';
  process.env.CORS_ORIGINS = 'http://localhost:8080';
});

// Cria um usuário id 1 (é o `sub` usado nos tokens de dono nos testes).
async function build() {
  const userRepo = makeFakeUserRepo();
  const personagemRepo = makeFakePersonagemRepo();
  const bossRepo = makeFakeBossRepo();
  const userBossRepo = makeFakeUserBossRepo(bossRepo);
  const raidPlayerRepo = makeFakeRaidPlayerRepo(personagemRepo, userRepo);
  const characterService = createCharacterService({ personagemRepo, raidPlayerRepo, userRepo });
  const progressionService = createProgressionService({ userRepo, bossRepo, userBossRepo });
  const app = createApp({ authService: {} as any, characterService, progressionService, bossRepo });
  await userRepo.upsertByDiscordId({ discord_id: 'd1', username: 'owner', nickname: null, avatar: null, email: null, role: 'user' });
  return { app, userRepo, personagemRepo, raidPlayerRepo };
}

const tokenFor = (sub: number, role: 'user' | 'admin' = 'user') => signAccessToken({ sub, role });

describe('rotas de personagens', () => {
  it('GET /reference/classes devolve 16 combat styles e 48 disciplinas', async () => {
    const res = await request((await build()).app).get('/reference/classes').set('Authorization', `Bearer ${tokenFor(1)}`);
    expect(res.status).toBe(200);
    expect(res.body.combatStyles).toHaveLength(16);
    expect(res.body.disciplines).toHaveLength(48);
  });

  it('cria personagem válido e lista', async () => {
    const { app } = await build();
    const t = tokenFor(1);
    const create = await request(app).post('/characters').set('Authorization', `Bearer ${t}`)
      .send({ nome: 'Kira', faccao: 'Republic', classe: 'Guardian', role: 'Tank', item_level: 340 });
    expect(create.status).toBe(201);
    expect(create.body.tier).toBe(0);
    const list = await request(app).get('/characters').set('Authorization', `Bearer ${t}`);
    expect(list.body).toHaveLength(1);
  });

  it('rejeita criação incoerente (422)', async () => {
    const { app } = await build();
    const res = await request(app).post('/characters').set('Authorization', `Bearer ${tokenFor(1)}`)
      .send({ nome: 'X', faccao: 'Republic', classe: 'Juggernaut', role: 'Tank', item_level: 1 });
    expect(res.status).toBe(422);
  });

  it('usuário não edita personagem de outro (403)', async () => {
    const { app } = await build();
    const created = await request(app).post('/characters').set('Authorization', `Bearer ${tokenFor(1)}`)
      .send({ nome: 'Kira', faccao: 'Republic', classe: 'Guardian', role: 'Tank', item_level: 340 });
    const res = await request(app).patch(`/characters/${created.body.id}`).set('Authorization', `Bearer ${tokenFor(2)}`)
      .send({ item_level: 999 });
    expect(res.status).toBe(403);
  });

  it('admin dá award à conta e o Tier acompanha no personagem', async () => {
    const { app } = await build();
    const created = await request(app).post('/characters').set('Authorization', `Bearer ${tokenFor(1)}`)
      .send({ nome: 'Kira', faccao: 'Republic', classe: 'Guardian', role: 'Tank', item_level: 340 });
    const id = created.body.id;
    const bossIds = Array.from({ length: 26 }, (_, i) => i + 1); // 26 pontos -> Tier 1
    const award = await request(app).post(`/admin/users/1/bosses`).set('Authorization', `Bearer ${tokenFor(9, 'admin')}`)
      .send({ bossIds });
    expect(award.status).toBe(200);
    const get = await request(app).get(`/characters/${id}`).set('Authorization', `Bearer ${tokenFor(1)}`);
    expect(get.body.total_points).toBe(26);
    expect(get.body.tier).toBe(1);
  });

  it('user comum não dá award (403)', async () => {
    const { app } = await build();
    const res = await request(app).post(`/admin/users/1/bosses`).set('Authorization', `Bearer ${tokenFor(1)}`).send({ bossIds: [1] });
    expect(res.status).toBe(403);
  });
});

describe('apagar personagem inscrito (007)', () => {
  it('personagem inscrito numa raid → 409 e NÃO apaga', async () => {
    const { app, personagemRepo, raidPlayerRepo } = await build();
    const p = await personagemRepo.create({ usuario_id: 1, nome: 'Kira', faccao: 'Republic', classe: 'Guardian', especializacao: null, role: 'Tank', origin_story: null, item_level: 340 });
    await raidPlayerRepo.create({ raid_id: 99, usuario_id: 1, personagem_id: p.id, role: 'Tank', status: 'confirmed', joined_at: new Date() });

    const res = await request(app).delete(`/characters/${p.id}`).set('Authorization', `Bearer ${tokenFor(1)}`);
    expect(res.status).toBe(409);
    expect(await personagemRepo.findById(p.id)).not.toBeNull();
  });

  it('personagem livre → apaga normalmente', async () => {
    const { app, personagemRepo } = await build();
    const p = await personagemRepo.create({ usuario_id: 1, nome: 'Solo', faccao: 'Republic', classe: 'Guardian', especializacao: null, role: 'Tank', origin_story: null, item_level: 340 });

    const res = await request(app).delete(`/characters/${p.id}`).set('Authorization', `Bearer ${tokenFor(1)}`);
    expect(res.status).toBe(204);
    expect(await personagemRepo.findById(p.id)).toBeNull();
  });

  it('existsByPersonagem reflete a inscrição', async () => {
    const { personagemRepo, raidPlayerRepo } = await build();
    const p = await personagemRepo.create({ usuario_id: 1, nome: 'X', faccao: 'Republic', classe: 'Guardian', especializacao: null, role: 'Tank', origin_story: null, item_level: 340 });
    expect(await raidPlayerRepo.existsByPersonagem(p.id)).toBe(false);
    await raidPlayerRepo.create({ raid_id: 99, usuario_id: 1, personagem_id: p.id, role: 'Tank', status: 'confirmed', joined_at: new Date() });
    expect(await raidPlayerRepo.existsByPersonagem(p.id)).toBe(true);
  });
});
