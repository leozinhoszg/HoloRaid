import { buildAuthUrl, exchangeCodeForProfile } from '../src/modules/auth/discord';

beforeAll(() => {
  process.env.JWT_SECRET = 'z'.repeat(40);
  process.env.DATABASE_URL = 'mysql://u:p@h:3306/db';
  process.env.DISCORD_CLIENT_ID = 'CID';
  process.env.DISCORD_CLIENT_SECRET = 'SEC';
  process.env.DISCORD_REDIRECT_URI = 'http://localhost:3000/auth/callback';
});

describe('discord', () => {
  it('monta URL de consentimento com PKCE e state', () => {
    const url = new URL(buildAuthUrl('st4te', 'chall'));
    expect(url.origin + url.pathname).toBe('https://discord.com/oauth2/authorize');
    expect(url.searchParams.get('client_id')).toBe('CID');
    expect(url.searchParams.get('state')).toBe('st4te');
    expect(url.searchParams.get('code_challenge')).toBe('chall');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('scope')).toContain('identify');
  });

  it('troca code por perfil', async () => {
    const fakeFetch = async (input: any): Promise<any> => {
      const u = String(input);
      if (u.includes('/oauth2/token')) return { ok: true, json: async () => ({ access_token: 'AT' }) };
      if (u.includes('/users/@me')) return { ok: true, json: async () => ({ id: '42', username: 'thi', avatar: 'abc', email: 'e@x.com' }) };
      return { ok: false, status: 404, json: async () => ({}) };
    };
    const p = await exchangeCodeForProfile('code', 'verifier', { fetch: fakeFetch as any });
    expect(p).toEqual({ id: '42', username: 'thi', avatar: 'abc', email: 'e@x.com' });
  });

  it('lança se o Discord recusa o code', async () => {
    const fakeFetch = async (): Promise<any> => ({ ok: false, status: 400, json: async () => ({ error: 'invalid_grant' }) });
    await expect(exchangeCodeForProfile('bad', 'v', { fetch: fakeFetch as any })).rejects.toThrow();
  });
});
