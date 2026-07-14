import { getConfig } from '../../config';
import { UnauthorizedError } from '../../common/errors/AppError';

const AUTH_URL = 'https://discord.com/oauth2/authorize';
const TOKEN_URL = 'https://discord.com/api/oauth2/token';
const ME_URL = 'https://discord.com/api/users/@me';

export type DiscordProfile = { id: string; username: string; avatar: string | null; email: string | null };
type Deps = { fetch?: typeof fetch };

export function buildAuthUrl(state: string, codeChallenge: string): string {
  const cfg = getConfig();
  const params = new URLSearchParams({
    client_id: cfg.DISCORD_CLIENT_ID,
    redirect_uri: cfg.DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope: 'identify email',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    prompt: 'none',
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForProfile(
  code: string,
  codeVerifier: string,
  deps: Deps = {},
): Promise<DiscordProfile> {
  const cfg = getConfig();
  const doFetch = deps.fetch ?? fetch;

  const tokenRes = await doFetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cfg.DISCORD_CLIENT_ID,
      client_secret: cfg.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: cfg.DISCORD_REDIRECT_URI,
      code_verifier: codeVerifier,
    }),
  });
  if (!tokenRes.ok) throw new UnauthorizedError('Falha ao trocar o code do Discord');
  const token = (await tokenRes.json()) as { access_token?: string };
  if (!token.access_token) throw new UnauthorizedError('Discord não retornou access_token');

  const meRes = await doFetch(ME_URL, { headers: { Authorization: `Bearer ${token.access_token}` } });
  if (!meRes.ok) throw new UnauthorizedError('Falha ao buscar perfil do Discord');
  const me = (await meRes.json()) as { id: string; username: string; avatar: string | null; email?: string | null };

  return { id: me.id, username: me.username, avatar: me.avatar ?? null, email: me.email ?? null };
}
