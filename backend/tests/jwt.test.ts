import { signAccessToken, verifyAccessToken } from '../src/common/security/jwt';

beforeAll(() => {
  process.env.JWT_SECRET = 'z'.repeat(40);
  process.env.DATABASE_URL = 'mysql://u:p@h:3306/db';
  process.env.DISCORD_CLIENT_ID = 'cid';
  process.env.DISCORD_CLIENT_SECRET = 's';
  process.env.DISCORD_REDIRECT_URI = 'http://localhost:3000/auth/callback';
});

describe('jwt', () => {
  it('assina e verifica claims', () => {
    const token = signAccessToken({ sub: 42, role: 'admin' });
    const claims = verifyAccessToken(token);
    expect(claims.sub).toBe(42);
    expect(claims.role).toBe('admin');
  });

  it('rejeita token adulterado', () => {
    const token = signAccessToken({ sub: 1, role: 'user' });
    expect(() => verifyAccessToken(token + 'x')).toThrow();
  });

  it('rejeita token de outro segredo', () => {
    const jwt = require('jsonwebtoken');
    const forjado = jwt.sign({ sub: 1, role: 'admin' }, 'segredo-errado');
    expect(() => verifyAccessToken(forjado)).toThrow();
  });
});
