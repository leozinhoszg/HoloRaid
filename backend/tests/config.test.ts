import { loadConfig } from '../src/config';

const good = {
  DATABASE_URL: 'mysql://u:p@h:3306/db',
  JWT_SECRET: 'x'.repeat(32),
  DISCORD_CLIENT_ID: 'cid',
  DISCORD_CLIENT_SECRET: 'secret',
  DISCORD_REDIRECT_URI: 'http://localhost:3000/auth/callback',
  ADMIN_DISCORD_IDS: '111, 222',
  CORS_ORIGINS: 'http://a.com,http://b.com',
};

describe('loadConfig', () => {
  it('parseia env válido e transforma listas', () => {
    const c = loadConfig(good as any);
    expect(c.PORT).toBe(3000);
    expect(c.ADMIN_DISCORD_IDS).toEqual(['111', '222']);
    expect(c.CORS_ORIGINS).toEqual(['http://a.com', 'http://b.com']);
  });

  it('lança se JWT_SECRET é curto (fail-fast)', () => {
    expect(() => loadConfig({ ...good, JWT_SECRET: 'curto' } as any)).toThrow();
  });

  it('lança se falta DATABASE_URL', () => {
    const { DATABASE_URL, ...rest } = good;
    expect(() => loadConfig(rest as any)).toThrow();
  });
});
