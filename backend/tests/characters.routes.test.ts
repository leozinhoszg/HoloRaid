import request from 'supertest';
import { createApp } from '../src/app';
import { makeFakePersonagemRepo, makeFakeBossRepo, makeFakeCharacterBossRepo } from './fakes/fakeRepos';
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

function build() {
  const personagemRepo = makeFakePersonagemRepo();
  const bossRepo = makeFakeBossRepo();
  const charBossRepo = makeFakeCharacterBossRepo(bossRepo);
  const characterService = createCharacterService({ personagemRepo });
  const progressionService = createProgressionService({ personagemRepo, bossRepo, charBossRepo });
  const app = createApp({ authService: {} as any, characterService, progressionService, bossRepo });
  return { app };
}

const tokenFor = (sub: number, role: 'user' | 'admin' = 'user') => signAccessToken({ sub, role });

describe('rotas de personagens', () => {
  it('GET /reference/classes devolve 16 combat styles e 48 disciplinas', async () => {
    const res = await request(build().app).get('/reference/classes').set('Authorization', `Bearer ${tokenFor(1)}`);
    expect(res.status).toBe(200);
    expect(res.body.combatStyles).toHaveLength(16);
    expect(res.body.disciplines).toHaveLength(48);
  });

  it('cria personagem válido e lista', async () => {
    const { app } = build();
    const t = tokenFor(1);
    const create = await request(app).post('/characters').set('Authorization', `Bearer ${t}`)
      .send({ nome: 'Kira', faccao: 'Republic', classe: 'Guardian', role: 'Tank', item_level: 340 });
    expect(create.status).toBe(201);
    expect(create.body.tier).toBe(0);
    const list = await request(app).get('/characters').set('Authorization', `Bearer ${t}`);
    expect(list.body).toHaveLength(1);
  });

  it('rejeita criação incoerente (422)', async () => {
    const { app } = build();
    const res = await request(app).post('/characters').set('Authorization', `Bearer ${tokenFor(1)}`)
      .send({ nome: 'X', faccao: 'Republic', classe: 'Juggernaut', role: 'Tank', item_level: 1 });
    expect(res.status).toBe(422);
  });

  it('usuário não edita personagem de outro (403)', async () => {
    const { app } = build();
    const created = await request(app).post('/characters').set('Authorization', `Bearer ${tokenFor(1)}`)
      .send({ nome: 'Kira', faccao: 'Republic', classe: 'Guardian', role: 'Tank', item_level: 340 });
    const res = await request(app).patch(`/characters/${created.body.id}`).set('Authorization', `Bearer ${tokenFor(2)}`)
      .send({ item_level: 999 });
    expect(res.status).toBe(403);
  });

  it('admin dá award e o Tier acompanha', async () => {
    const { app } = build();
    const created = await request(app).post('/characters').set('Authorization', `Bearer ${tokenFor(1)}`)
      .send({ nome: 'Kira', faccao: 'Republic', classe: 'Guardian', role: 'Tank', item_level: 340 });
    const id = created.body.id;
    const bossIds = Array.from({ length: 26 }, (_, i) => i + 1); // 26 pontos -> Tier 1
    const award = await request(app).post(`/admin/characters/${id}/bosses`).set('Authorization', `Bearer ${tokenFor(9, 'admin')}`)
      .send({ bossIds });
    expect(award.status).toBe(200);
    const get = await request(app).get(`/characters/${id}`).set('Authorization', `Bearer ${tokenFor(1)}`);
    expect(get.body.total_points).toBe(26);
    expect(get.body.tier).toBe(1);
  });

  it('user comum não dá award (403)', async () => {
    const { app } = build();
    const created = await request(app).post('/characters').set('Authorization', `Bearer ${tokenFor(1)}`)
      .send({ nome: 'Kira', faccao: 'Republic', classe: 'Guardian', role: 'Tank', item_level: 340 });
    const res = await request(app).post(`/admin/characters/${created.body.id}/bosses`).set('Authorization', `Bearer ${tokenFor(1)}`).send({ bossIds: [1] });
    expect(res.status).toBe(403);
  });
});
