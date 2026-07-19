import request from 'supertest';
import { createApp } from '../src/app';
import { makeFakeRaidRepo, makeFakeRaidPlayerRepo, makeFakePersonagemRepo, makeFakeUserRepo } from './fakes/fakeRepos';
import { createRaidService } from '../src/modules/raids/raids.service';
import { createRaidJoinService } from '../src/modules/raids/raidJoin.service';
import { signAccessToken } from '../src/common/security/jwt';

beforeAll(() => {
  process.env.JWT_SECRET = 'z'.repeat(40); process.env.DISCORD_CLIENT_ID = 'C';
  process.env.DISCORD_CLIENT_SECRET = 'S'; process.env.DISCORD_REDIRECT_URI = 'http://localhost/cb';
  process.env.CORS_ORIGINS = 'http://localhost:8080';
});

function build() {
  const raidRepo = makeFakeRaidRepo();
  const userRepo = makeFakeUserRepo();
  const personagemRepo = makeFakePersonagemRepo();
  const raidPlayerRepo = makeFakeRaidPlayerRepo(personagemRepo, userRepo);
  const raidService = createRaidService({ raidRepo, raidPlayerRepo });
  const raidJoinService = createRaidJoinService({ raidRepo, raidPlayerRepo, personagemRepo, userRepo });
  const app = createApp({ authService: {} as any, raidService, raidJoinService });
  return { app, personagemRepo };
}
const tok = (sub: number, role: 'user' | 'admin' = 'user') => signAccessToken({ sub, role });
const raidBody = { operation: 'Dread Palace', difficulty: 'HM', size: 8, faction: 'Republic', minimum_tier: 0, check_composition: false, slots_tank: 2, slots_heal: 2, slots_dps: 4, start_at: '2026-08-01T20:30:00.000Z' };

describe('rotas de raids', () => {
  it('cria e detalha uma raid', async () => {
    const { app } = build();
    const c = await request(app).post('/raids').set('Authorization', `Bearer ${tok(1)}`).send(raidBody);
    expect(c.status).toBe(201);
    expect(c.body.codigo).toHaveLength(8);
    const d = await request(app).get(`/raids/${c.body.id}`).set('Authorization', `Bearer ${tok(2)}`);
    expect(d.status).toBe(200);
    expect(d.body.roster).toEqual([]);
  });

  it('rejeita criação com slots que não somam o size (422)', async () => {
    const { app } = build();
    const res = await request(app).post('/raids').set('Authorization', `Bearer ${tok(1)}`).send({ ...raidBody, slots_dps: 5 });
    expect(res.status).toBe(422);
  });

  it('join valida Tier mínimo (422)', async () => {
    const { app, personagemRepo } = build();
    const raid = await request(app).post('/raids').set('Authorization', `Bearer ${tok(1)}`).send({ ...raidBody, minimum_tier: 2 });
    const p = await personagemRepo.create({ usuario_id: 5, nome: 'Low', faccao: 'Republic', classe: 'Sentinel', especializacao: null, role: 'DPS', origin_story: null, item_level: 300 });
    const res = await request(app).post(`/raids/${raid.body.id}/join`).set('Authorization', `Bearer ${tok(5)}`).send({ personagem_id: p.id });
    expect(res.status).toBe(422);
  });

  it('join confirma e aparece no roster; sair remove', async () => {
    const { app, personagemRepo } = build();
    const raid = await request(app).post('/raids').set('Authorization', `Bearer ${tok(1)}`).send(raidBody);
    const p = await personagemRepo.create({ usuario_id: 5, nome: 'Ok', faccao: 'Republic', classe: 'Sentinel', especializacao: null, role: 'DPS', origin_story: null, item_level: 330 });
    const j = await request(app).post(`/raids/${raid.body.id}/join`).set('Authorization', `Bearer ${tok(5)}`).send({ personagem_id: p.id });
    expect(j.status).toBe(200);
    expect(j.body.status).toBe('confirmed');
    const d = await request(app).get(`/raids/${raid.body.id}`).set('Authorization', `Bearer ${tok(5)}`);
    expect(d.body.roster).toHaveLength(1);
    expect(d.body.roster[0].tier).toBe(0);
    const l = await request(app).delete(`/raids/${raid.body.id}/leave`).set('Authorization', `Bearer ${tok(5)}`);
    expect(l.status).toBe(204);
  });

  it('não-líder não inicia (403); líder inicia', async () => {
    const { app } = build();
    const raid = await request(app).post('/raids').set('Authorization', `Bearer ${tok(1)}`).send(raidBody);
    expect((await request(app).post(`/raids/${raid.body.id}/start`).set('Authorization', `Bearer ${tok(2)}`)).status).toBe(403);
    expect((await request(app).post(`/raids/${raid.body.id}/start`).set('Authorization', `Bearer ${tok(1)}`)).status).toBe(200);
  });

  it('resolve por código', async () => {
    const { app } = build();
    const raid = await request(app).post('/raids').set('Authorization', `Bearer ${tok(1)}`).send(raidBody);
    const res = await request(app).get(`/raids/code/${raid.body.codigo}`).set('Authorization', `Bearer ${tok(3)}`);
    expect(res.body.id).toBe(raid.body.id);
  });
});
