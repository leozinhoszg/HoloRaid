import request from 'supertest';
import { createApp } from '../src/app';
import { makeFakeUserRepo, makeFakeRefreshTokenRepo } from './fakes/fakeRepos';
import { createAuthService } from '../src/modules/auth/auth.service';

beforeAll(() => {
  process.env.JWT_SECRET = 'z'.repeat(40);
  process.env.DATABASE_URL = 'mysql://u:p@h:3306/db';
  process.env.DISCORD_CLIENT_ID = 'CID';
  process.env.DISCORD_CLIENT_SECRET = 'SEC';
  process.env.DISCORD_REDIRECT_URI = 'http://localhost:3000/auth/callback';
  process.env.CORS_ORIGINS = 'http://localhost:8080';
});

function build(adminIds: string[] = []) {
  const userRepo = makeFakeUserRepo();
  const refreshRepo = makeFakeRefreshTokenRepo();
  const authService = createAuthService({
    userRepo, refreshRepo,
    config: { ADMIN_DISCORD_IDS: adminIds, REFRESH_TOKEN_TTL_DAYS: 30 } as any,
    exchange: async () => ({ id: '999', username: 'thi', avatar: null, email: 'e@x.com' }),
  });
  return createApp({ authService });
}

describe('rotas de auth', () => {
  it('GET /auth/discord/url devolve url + state + verifier', async () => {
    const res = await request(build()).get('/auth/discord/url');
    expect(res.status).toBe(200);
    expect(res.body.url).toContain('discord.com');
    expect(res.body.state).toBeTruthy();
    expect(res.body.codeVerifier).toBeTruthy();
  });

  it('POST /auth/callback emite access token e seta cookie de refresh', async () => {
    const res = await request(build()).post('/auth/callback').send({ code: 'c', codeVerifier: 'v' });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    const cookies = res.headers['set-cookie'] as unknown as string[] | undefined;
    expect(cookies?.join(';')).toContain('rs_rt=');
  });

  it('POST /auth/callback inválido (sem code) dá 422', async () => {
    const res = await request(build()).post('/auth/callback').send({ codeVerifier: 'v' });
    expect(res.status).toBe(422);
  });

  it('fluxo refresh via cookie rotaciona', async () => {
    const app = build();
    const agent = request.agent(app);
    await agent.post('/auth/callback').send({ code: 'c', codeVerifier: 'v' });
    const res = await agent.post('/auth/refresh').send({});
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
  });

  it('rota inexistente dá 404 no formato padrão', async () => {
    const res = await request(build()).get('/nada');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
