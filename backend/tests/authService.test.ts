import { makeFakeUserRepo, makeFakeRefreshTokenRepo } from './fakes/fakeRepos';
import { createAuthService } from '../src/modules/auth/auth.service';
import { verifyAccessToken } from '../src/common/security/jwt';

beforeAll(() => {
  process.env.JWT_SECRET = 'z'.repeat(40);
  process.env.DATABASE_URL = 'mysql://u:p@h:3306/db';
  process.env.DISCORD_CLIENT_ID = 'CID';
  process.env.DISCORD_CLIENT_SECRET = 'SEC';
  process.env.DISCORD_REDIRECT_URI = 'http://localhost:3000/auth/callback';
});

function makeService(adminIds: string[] = []) {
  const userRepo = makeFakeUserRepo();
  const refreshRepo = makeFakeRefreshTokenRepo();
  const exchange = async () => ({ id: '999', username: 'thi', avatar: null, email: 'e@x.com' });
  const svc = createAuthService({
    userRepo, refreshRepo,
    config: { ADMIN_DISCORD_IDS: adminIds, REFRESH_TOKEN_TTL_DAYS: 30 } as any,
    exchange,
  });
  return { svc, userRepo, refreshRepo };
}

describe('authService', () => {
  it('loginWithCode cria user e emite par válido', async () => {
    const { svc } = makeService();
    const pair = await svc.loginWithCode('code', 'verifier', 'web');
    expect(verifyAccessToken(pair.accessToken).role).toBe('user');
    expect(pair.refreshToken).toBeTruthy();
  });

  it('semente de admin promove no login', async () => {
    const { svc } = makeService(['999']);
    const pair = await svc.loginWithCode('code', 'verifier', 'web');
    expect(verifyAccessToken(pair.accessToken).role).toBe('admin');
  });

  it('rotate emite novo par e invalida o antigo', async () => {
    const { svc } = makeService();
    const first = await svc.loginWithCode('code', 'verifier', 'web');
    const second = await svc.rotate(first.refreshToken, 'web');
    expect(second.refreshToken).not.toBe(first.refreshToken);
    await expect(svc.rotate(first.refreshToken, 'web')).rejects.toThrow(); // reuso do antigo falha
  });

  it('reuso de token revogado revoga a família inteira', async () => {
    const { svc } = makeService();
    const first = await svc.loginWithCode('code', 'verifier', 'web');
    const second = await svc.rotate(first.refreshToken, 'web'); // revoga first
    await expect(svc.rotate(first.refreshToken, 'web')).rejects.toThrow(); // reuso -> revoga família
    await expect(svc.rotate(second.refreshToken, 'web')).rejects.toThrow(); // agora o válido também morreu
  });

  it('revoke (logout) invalida o refresh', async () => {
    const { svc } = makeService();
    const pair = await svc.loginWithCode('code', 'verifier', 'web');
    await svc.revoke(pair.refreshToken);
    await expect(svc.rotate(pair.refreshToken, 'web')).rejects.toThrow();
  });
});
