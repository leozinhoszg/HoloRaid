import express from 'express';
import request from 'supertest';
import { signAccessToken } from '../src/common/security/jwt';
import { requireAuth, requireAdmin } from '../src/common/security/guards';
import { errorHandler } from '../src/common/middleware/errorHandler';

beforeAll(() => {
  process.env.JWT_SECRET = 'z'.repeat(40);
  process.env.DATABASE_URL = 'mysql://u:p@h:3306/db';
  process.env.DISCORD_CLIENT_ID = 'cid';
  process.env.DISCORD_CLIENT_SECRET = 's';
  process.env.DISCORD_REDIRECT_URI = 'http://localhost:3000/auth/callback';
});

function app() {
  const a = express();
  a.get('/me', requireAuth, (req, res) => res.json({ sub: (req as any).user.sub }));
  a.get('/admin', requireAuth, requireAdmin, (_req, res) => res.json({ ok: true }));
  a.use(errorHandler);
  return a;
}

describe('guards', () => {
  it('nega sem token (401)', async () => {
    expect((await request(app()).get('/me')).status).toBe(401);
  });

  it('aceita token válido', async () => {
    const t = signAccessToken({ sub: 7, role: 'user' });
    const res = await request(app()).get('/me').set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(200);
    expect(res.body.sub).toBe(7);
  });

  it('nega user comum em rota admin (403)', async () => {
    const t = signAccessToken({ sub: 7, role: 'user' });
    const res = await request(app()).get('/admin').set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(403);
  });

  it('aceita admin em rota admin', async () => {
    const t = signAccessToken({ sub: 1, role: 'admin' });
    const res = await request(app()).get('/admin').set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(200);
  });
});
