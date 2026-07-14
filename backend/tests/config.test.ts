import { loadConfig } from '../src/config';

const good = {
  DB_HOST: '127.0.0.1',
  DB_USER: 'root',
  DB_PASSWORD: 'secret',
  DB_NAME: 'raidsync',
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

  it('aplica defaults de banco quando ausentes', () => {
    const { DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, ...rest } = good;
    const c = loadConfig(rest as any);
    expect(c.DB_HOST).toBe('127.0.0.1');
    expect(c.DB_PORT).toBe(3306);
    expect(c.DB_USER).toBe('root');
    expect(c.DB_PASSWORD).toBe('');
    expect(c.DB_NAME).toBe('raidsync');
  });

  it('lança se JWT_SECRET é curto (fail-fast)', () => {
    expect(() => loadConfig({ ...good, JWT_SECRET: 'curto' } as any)).toThrow();
  });

  it('lança se falta DISCORD_CLIENT_ID (fail-fast)', () => {
    const { DISCORD_CLIENT_ID, ...rest } = good;
    expect(() => loadConfig(rest as any)).toThrow();
  });
});
