import request from 'supertest';
import { createApp } from '../src/app';
import { signAccessToken } from '../src/common/security/jwt';

beforeAll(() => { process.env.JWT_SECRET = 'z'.repeat(40); process.env.DISCORD_CLIENT_ID = 'C'; process.env.DISCORD_CLIENT_SECRET = 'S'; process.env.DISCORD_REDIRECT_URI = 'http://localhost/cb'; });

// stub: só listForUser é chamado pelo controller; registra o userId recebido
function stubRepo(spy?: (uid: number) => void) {
  return {
    async listForUser(uid: number) {
      spy?.(uid);
      return [{ id: 1, codigo: 'AB12', operation: 'Dread Palace', difficulty: 'HM', size: 8, faction: 'Republic', start_at: new Date('2026-08-01T20:30:00Z'), status: 'OPEN', created: true, myStatus: null }];
    },
  } as any;
}
const tok = (sub = 7) => signAccessToken({ sub, role: 'user' });

describe('GET /me/raids', () => {
  it('sem JWT → 401', async () => {
    const app = createApp({ authService: {} as any, profileRaidRepo: stubRepo() });
    expect((await request(app).get('/me/raids')).status).toBe(401);
  });

  it('com JWT → 200, usa o sub do token e devolve a lista', async () => {
    let uid = 0;
    const app = createApp({ authService: {} as any, profileRaidRepo: stubRepo((u) => { uid = u; }) });
    const res = await request(app).get('/me/raids').set('Authorization', `Bearer ${tok(7)}`);
    expect(res.status).toBe(200);
    expect(uid).toBe(7);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ codigo: 'AB12', created: true, myStatus: null });
  });
});
