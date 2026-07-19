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

async function build() {
  const userRepo = makeFakeUserRepo();
  const personagemRepo = makeFakePersonagemRepo();
  const bossRepo = makeFakeBossRepo();
  const userBossRepo = makeFakeUserBossRepo(bossRepo);
  const raidPlayerRepo = makeFakeRaidPlayerRepo(personagemRepo, userRepo);
  const characterService = createCharacterService({ personagemRepo, raidPlayerRepo, userRepo });
  const progressionService = createProgressionService({ userRepo, bossRepo, userBossRepo });
  const app = createApp({ authService: {} as any, characterService, progressionService, bossRepo });
  const u = await userRepo.upsertByDiscordId({ discord_id: 'd1', username: 'Kira', nickname: null, avatar: null, email: null, role: 'user' });
  const p = await personagemRepo.create({ usuario_id: u.id, nome: 'Kira', faccao: 'Republic', classe: 'Guardian', especializacao: null, role: 'Tank', origin_story: null, item_level: 340 });
  return { app, uid: u.id, charId: p.id };
}
const tok = (sub: number) => signAccessToken({ sub, role: 'user' });

describe('auto-report PUT /me/bosses (conta)', () => {
  it('sincroniza bosses e o total/tier da conta acompanha (visível no personagem)', async () => {
    const { app, uid, charId } = await build();
    const r1 = await request(app).put('/me/bosses').set('Authorization', `Bearer ${tok(uid)}`)
      .send({ bossIds: Array.from({ length: 26 }, (_, i) => i + 1) });
    expect(r1.status).toBe(200);
    expect(r1.body.total_points).toBe(26);
    const g1 = await request(app).get(`/characters/${charId}`).set('Authorization', `Bearer ${tok(uid)}`);
    expect(g1.body.total_points).toBe(26);
    expect(g1.body.tier).toBe(1);
    const r2 = await request(app).put('/me/bosses').set('Authorization', `Bearer ${tok(uid)}`)
      .send({ bossIds: [1, 2, 3] });
    expect(r2.status).toBe(200);
    const g2 = await request(app).get(`/characters/${charId}`).set('Authorization', `Bearer ${tok(uid)}`);
    expect(g2.body.total_points).toBe(3);
  });

  it('requer autenticação', async () => {
    const { app } = await build();
    const res = await request(app).put('/me/bosses').send({ bossIds: [1] });
    expect(res.status).toBe(401);
  });
});
