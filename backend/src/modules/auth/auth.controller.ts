import type { Request, Response } from 'express';
import { getConfig } from '../../config';
import { randomState, createPkcePair } from '../../common/security/tokens';
import { buildAuthUrl } from './discord';
import { UnauthorizedError } from '../../common/errors/AppError';
import type { AuthService } from './auth.service';

const COOKIE = 'rs_rt';

function setRefreshCookie(res: Response, token: string, expires: Date) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    secure: getConfig().NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/auth',
    expires,
  });
}

export function createAuthController(authService: AuthService) {
  return {
    getDiscordUrl(_req: Request, res: Response) {
      const state = randomState();
      const { verifier, challenge } = createPkcePair();
      res.json({ url: buildAuthUrl(state, challenge), state, codeVerifier: verifier });
    },

    async callback(req: Request, res: Response) {
      const { code, codeVerifier, device } = req.body as { code: string; codeVerifier: string; device?: string };
      const pair = await authService.loginWithCode(code, codeVerifier, device ?? 'web');
      setRefreshCookie(res, pair.refreshToken, pair.refreshExpiresAt);
      res.json({ accessToken: pair.accessToken, refreshToken: pair.refreshToken, user: pair.user });
    },

    async refresh(req: Request, res: Response) {
      const body = req.body as { refreshToken?: string; device?: string };
      const raw = body.refreshToken ?? (req.cookies?.[COOKIE] as string | undefined);
      if (!raw) throw new UnauthorizedError('Refresh ausente');
      const pair = await authService.rotate(raw, body.device ?? 'web');
      setRefreshCookie(res, pair.refreshToken, pair.refreshExpiresAt);
      res.json({ accessToken: pair.accessToken, refreshToken: pair.refreshToken });
    },

    async logout(req: Request, res: Response) {
      const raw = (req.body as { refreshToken?: string }).refreshToken ?? (req.cookies?.[COOKIE] as string | undefined);
      if (raw) await authService.revoke(raw);
      res.clearCookie(COOKIE, { path: '/auth' });
      res.status(204).send();
    },
  };
}
