import request from 'supertest';
import { createApp } from '../src/app';
import { makeFakeUserRepo, makeFakeDeviceTokenRepo } from './fakes/fakeRepos';
import { createUserService } from '../src/modules/users/users.service';
import { signAccessToken } from '../src/common/security/jwt';

beforeAll(() => { process.env.JWT_SECRET = 'z'.repeat(40); process.env.DISCORD_CLIENT_ID = 'C'; process.env.DISCORD_CLIENT_SECRET = 'S'; process.env.DISCORD_REDIRECT_URI = 'http://localhost/cb'; });

async function setup() {
  const userRepo = makeFakeUserRepo();
  const deviceTokenRepo = makeFakeDeviceTokenRepo();
  const userService = createUserService({ userRepo, auditLog: async () => {} });
  const app = createApp({ authService: {} as any, userService, deviceTokenRepo });
  const u = await userRepo.upsertByDiscordId({ discord_id: 'd1', username: 'u1', nickname: null, avatar: null, email: null, role: 'user' });
  return { app, deviceTokenRepo, userRepo, u };
}
const tok = (id: number) => signAccessToken({ sub: id, role: 'user' });

describe('POST /devices', () => {
  it('sem JWT → 401', async () => {
    const { app } = await setup();
    const res = await request(app).post('/devices').send({ token: 't1', platform: 'android' });
    expect(res.status).toBe(401);
  });

  it('com JWT → 204 e grava com o usuario do token', async () => {
    const { app, deviceTokenRepo, u } = await setup();
    const res = await request(app).post('/devices').set('Authorization', `Bearer ${tok(u.id)}`).send({ token: 't1', platform: 'android' });
    expect(res.status).toBe(204);
    const rows = await deviceTokenRepo.listByUsuarios([u.id]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.token).toBe('t1');
    expect(rows[0]!.platform).toBe('android');
  });

  it('mesmo token 2x → não duplica', async () => {
    const { app, deviceTokenRepo, u } = await setup();
    const h = { Authorization: `Bearer ${tok(u.id)}` };
    await request(app).post('/devices').set(h).send({ token: 't1', platform: 'android' });
    await request(app).post('/devices').set(h).send({ token: 't1', platform: 'android' });
    expect(await deviceTokenRepo.listByUsuarios([u.id])).toHaveLength(1);
  });

  it('platform inválida → 422', async () => {
    const { app, u } = await setup();
    const res = await request(app).post('/devices').set('Authorization', `Bearer ${tok(u.id)}`).send({ token: 't1', platform: 'ios' });
    expect(res.status).toBe(422);
  });
});

describe('PUT /me/push', () => {
  it('grava push_enabled e GET /me reflete', async () => {
    const { app, u } = await setup();
    const h = { Authorization: `Bearer ${tok(u.id)}` };
    const res = await request(app).put('/me/push').set(h).send({ enabled: false });
    expect(res.status).toBe(204);
    const me = await request(app).get('/me').set(h);
    expect(me.body.push_enabled).toBe(false);
  });

  it('sem JWT → 401', async () => {
    const { app } = await setup();
    expect((await request(app).put('/me/push').send({ enabled: false })).status).toBe(401);
  });
});
