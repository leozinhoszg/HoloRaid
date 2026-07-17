import request from 'supertest';
import { createApp } from '../src/app';
import { makeFakePersonagemRepo, makeFakeBossRepo, makeFakeCharacterBossRepo, makeFakeRaidPlayerRepo } from './fakes/fakeRepos';
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

async function build() {
  const personagemRepo = makeFakePersonagemRepo();
  const bossRepo = makeFakeBossRepo();
  const charBossRepo = makeFakeCharacterBossRepo(bossRepo);
  const raidPlayerRepo = makeFakeRaidPlayerRepo(personagemRepo);
  const characterService = createCharacterService({ personagemRepo, raidPlayerRepo });
  const progressionService = createProgressionService({ personagemRepo, bossRepo, charBossRepo });
  const app = createApp({ authService: {} as any, characterService, progressionService, bossRepo });
  const p = await personagemRepo.create({ usuario_id: 1, nome: 'Kira', faccao: 'Republic', classe: 'Guardian', especializacao: null, role: 'Tank', origin_story: null, item_level: 340 });
  return { app, id: p.id };
}
const tok = (sub: number) => signAccessToken({ sub, role: 'user' });

describe('auto-report PUT /characters/:id/bosses', () => {
  it('dono sincroniza bosses e o total/tier acompanha', async () => {
    const { app, id } = await build();
    const r1 = await request(app).put(`/characters/${id}/bosses`).set('Authorization', `Bearer ${tok(1)}`)
      .send({ bossIds: Array.from({ length: 26 }, (_, i) => i + 1) });
    expect(r1.status).toBe(200);
    const g1 = await request(app).get(`/characters/${id}`).set('Authorization', `Bearer ${tok(1)}`);
    expect(g1.body.total_points).toBe(26);
    expect(g1.body.tier).toBe(1);
    // remove maioria -> total cai
    const r2 = await request(app).put(`/characters/${id}/bosses`).set('Authorization', `Bearer ${tok(1)}`)
      .send({ bossIds: [1, 2, 3] });
    expect(r2.status).toBe(200);
    const g2 = await request(app).get(`/characters/${id}`).set('Authorization', `Bearer ${tok(1)}`);
    expect(g2.body.total_points).toBe(3);
  });

  it('não-dono recebe 403', async () => {
    const { app, id } = await build();
    const res = await request(app).put(`/characters/${id}/bosses`).set('Authorization', `Bearer ${tok(2)}`).send({ bossIds: [1] });
    expect(res.status).toBe(403);
  });
});
