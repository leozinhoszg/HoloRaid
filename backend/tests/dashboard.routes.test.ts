import request from 'supertest';
import { createApp } from '../src/app';
import { signAccessToken } from '../src/common/security/jwt';

beforeAll(() => { process.env.JWT_SECRET = 'z'.repeat(40); process.env.DISCORD_CLIENT_ID = 'C'; process.env.DISCORD_CLIENT_SECRET = 'S'; process.env.DISCORD_REDIRECT_URI = 'http://localhost/cb'; });

function fakeService(spy?: (b: any) => void) {
  return {
    async getStats(b: any) {
      spy?.(b);
      return { raids: { today: 1, week: 2, month: 3 }, participantsThisMonth: 4,
        topOperations: [{ operation: 'Dread Palace', count: 5 }],
        topPlayers: [{ usuario_id: 1, username: 'kira', avatar: null, raids: 6 }] };
    },
  };
}
const tok = () => signAccessToken({ sub: 1, role: 'user' });

describe('GET /dashboard', () => {
  it('sem JWT → 401', async () => {
    const app = createApp({ authService: {} as any, dashboardService: fakeService() as any });
    expect((await request(app).get('/dashboard')).status).toBe(401);
  });

  it('com JWT → 200 e shape completo', async () => {
    const app = createApp({ authService: {} as any, dashboardService: fakeService() as any });
    const res = await request(app).get('/dashboard').set('Authorization', `Bearer ${tok()}`);
    expect(res.status).toBe(200);
    expect(res.body.raids).toEqual({ today: 1, week: 2, month: 3 });
    expect(res.body.participantsThisMonth).toBe(4);
    expect(res.body.topOperations[0].operation).toBe('Dread Palace');
    expect(res.body.topPlayers[0].username).toBe('kira');
  });

  it('params today/week/month são repassados como Boundaries', async () => {
    let got: any;
    const app = createApp({ authService: {} as any, dashboardService: fakeService((b) => { got = b; }) as any });
    const today = '2026-07-17T03:00:00.000Z';
    await request(app).get(`/dashboard?today=${today}&week=2026-07-13T03:00:00.000Z&month=2026-07-01T03:00:00.000Z`).set('Authorization', `Bearer ${tok()}`);
    expect(got.today.toISOString()).toBe(today);
  });

  it('sem params → usa fallback UTC (não quebra)', async () => {
    let got: any;
    const app = createApp({ authService: {} as any, dashboardService: fakeService((b) => { got = b; }) as any });
    const res = await request(app).get('/dashboard').set('Authorization', `Bearer ${tok()}`);
    expect(res.status).toBe(200);
    expect(got.today instanceof Date).toBe(true);
    expect(isNaN(got.today.getTime())).toBe(false);
  });
});
