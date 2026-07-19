import request from 'supertest';
import { createApp } from '../src/app';
import { makeFakeUserRepo, makeFakeRefreshTokenRepo } from './fakes/fakeRepos';
import { createAuthService } from '../src/modules/auth/auth.service';
import { createUserService } from '../src/modules/users/users.service';
import { signAccessToken } from '../src/common/security/jwt';

beforeAll(() => {
  process.env.JWT_SECRET = 'z'.repeat(40);
  process.env.DATABASE_URL = 'mysql://u:p@h:3306/db';
  process.env.DISCORD_CLIENT_ID = 'CID';
  process.env.DISCORD_CLIENT_SECRET = 'SEC';
  process.env.DISCORD_REDIRECT_URI = 'http://localhost:3000/auth/callback';
  process.env.CORS_ORIGINS = 'http://localhost:8080';
});

async function build() {
  const userRepo = makeFakeUserRepo();
  const refreshRepo = makeFakeRefreshTokenRepo();
  const audits: any[] = [];
  const userService = createUserService({ userRepo, auditLog: async (e) => { audits.push(e); } });
  const authService = createAuthService({
    userRepo, refreshRepo,
    config: { ADMIN_DISCORD_IDS: [], REFRESH_TOKEN_TTL_DAYS: 30 } as any,
    exchange: async () => ({ id: '1', username: 'user', avatar: null, email: null }),
  });
  // cria dois usuários: id 1 (user) e id 2 (admin)
  const u1 = await userRepo.upsertByDiscordId({ discord_id: '1', username: 'user', nickname: null, avatar: null, email: null, role: 'user' });
  const u2 = await userRepo.upsertByDiscordId({ discord_id: '2', username: 'boss', nickname: null, avatar: null, email: null, role: 'admin' });
  return { app: createApp({ authService, userService }), audits, u1, u2, userRepo };
}

describe('rotas de usuários', () => {
  it('GET /me devolve o próprio perfil', async () => {
    const { app, u1 } = await build();
    const token = signAccessToken({ sub: u1.id, role: 'user' });
    const res = await request(app).get('/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.discord_id).toBe('1');
  });

  it('GET /me sem token dá 401', async () => {
    const { app } = await build();
    expect((await request(app).get('/me')).status).toBe(401);
  });

  it('GET /me expõe total_points/tier/pointsToNextTier da conta', async () => {
    const { app, u1, userRepo } = await build();
    await userRepo.updateTotalPoints(u1.id, 26); // Tier 1, faltam 25 p/ o próximo (51)
    const token = signAccessToken({ sub: u1.id, role: 'user' });
    const res = await request(app).get('/me').set('Authorization', `Bearer ${token}`);
    expect(res.body.total_points).toBe(26);
    expect(res.body.tier).toBe(1);
    expect(res.body.pointsToNextTier).toBe(25);
  });

  it('user comum não lista usuários (403)', async () => {
    const { app, u1 } = await build();
    const token = signAccessToken({ sub: u1.id, role: 'user' });
    expect((await request(app).get('/users').set('Authorization', `Bearer ${token}`)).status).toBe(403);
  });

  it('admin promove outro usuário e grava auditoria', async () => {
    const { app, audits, u1, u2 } = await build();
    const token = signAccessToken({ sub: u2.id, role: 'admin' });
    const res = await request(app).post(`/users/${u1.id}/promote`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
    expect(audits.find((a) => a.action === 'promote' && a.target_id === u1.id)).toBeTruthy();
  });

  it('admin não pode se auto-rebaixar (400)', async () => {
    const { app, u2 } = await build();
    const token = signAccessToken({ sub: u2.id, role: 'admin' });
    const res = await request(app).post(`/users/${u2.id}/demote`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });
});

describe('push_enabled (#6)', () => {
  it('GET /me expõe push_enabled (default true)', async () => {
    const { app, u1 } = await build();
    const token = signAccessToken({ sub: u1.id, role: 'user' });
    const res = await request(app).get('/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.push_enabled).toBe(true);
  });

  it('setPushEnabled desliga e findByIds reflete', async () => {
    const { userRepo, u1 } = await build();
    await userRepo.setPushEnabled(u1.id, false);
    const found = await userRepo.findByIds([u1.id]);
    expect(found).toHaveLength(1);
    expect(found[0]!.push_enabled).toBe(false);
  });

  it('findByIds retorna vazio p/ lista vazia', async () => {
    const { userRepo } = await build();
    expect(await userRepo.findByIds([])).toEqual([]);
  });
});
