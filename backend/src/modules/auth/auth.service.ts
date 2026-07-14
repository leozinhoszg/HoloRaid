import { randomUUID } from 'node:crypto';
import type { UserRepo, UserRecord } from '../../db/repositories/userRepo';
import type { RefreshTokenRepo } from '../../db/repositories/refreshTokenRepo';
import { signAccessToken } from '../../common/security/jwt';
import { generateRefreshToken, hashToken } from '../../common/security/tokens';
import { exchangeCodeForProfile, type DiscordProfile } from './discord';
import { UnauthorizedError } from '../../common/errors/AppError';

export type TokenPair = { accessToken: string; refreshToken: string; refreshExpiresAt: Date };

type Deps = {
  userRepo: UserRepo;
  refreshRepo: RefreshTokenRepo;
  config: { ADMIN_DISCORD_IDS: string[]; REFRESH_TOKEN_TTL_DAYS: number };
  exchange?: (code: string, verifier: string) => Promise<DiscordProfile>;
  now?: () => Date;
};

export function createAuthService(deps: Deps) {
  const now = deps.now ?? (() => new Date());
  const exchange = deps.exchange ?? exchangeCodeForProfile;

  async function issue(user: UserRecord, familyId: string, device: string | null): Promise<TokenPair> {
    const accessToken = signAccessToken({ sub: user.id, role: user.role });
    const refreshToken = generateRefreshToken();
    const refreshExpiresAt = new Date(now().getTime() + deps.config.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
    await deps.refreshRepo.create({
      usuario_id: user.id,
      token_hash: hashToken(refreshToken),
      family_id: familyId,
      device,
      expires_at: refreshExpiresAt,
    });
    return { accessToken, refreshToken, refreshExpiresAt };
  }

  return {
    async loginWithCode(code: string, codeVerifier: string, device: string | null): Promise<TokenPair & { user: UserRecord }> {
      const profile = await exchange(code, codeVerifier);
      const role = deps.config.ADMIN_DISCORD_IDS.includes(profile.id) ? 'admin' : 'user';
      const user = await deps.userRepo.upsertByDiscordId({
        discord_id: profile.id,
        username: profile.username,
        nickname: null,
        avatar: profile.avatar,
        email: profile.email,
        role,
      });
      // Se já existia e está na semente, garante o papel admin.
      if (role === 'admin' && user.role !== 'admin') {
        await deps.userRepo.updateRole(user.id, 'admin');
        user.role = 'admin';
      }
      const pair = await issue(user, randomUUID(), device);
      return { ...pair, user };
    },

    async rotate(rawRefresh: string, device: string | null): Promise<TokenPair> {
      const rec = await deps.refreshRepo.findByHash(hashToken(rawRefresh));
      if (!rec) throw new UnauthorizedError('Refresh inválido');
      if (rec.revoked_at) {
        // Reuso de token já revogado: possível roubo → mata a família toda.
        await deps.refreshRepo.revokeFamily(rec.family_id);
        throw new UnauthorizedError('Refresh reutilizado — sessão revogada');
      }
      if (rec.expires_at.getTime() <= now().getTime()) throw new UnauthorizedError('Refresh expirado');

      const user = await deps.userRepo.findById(rec.usuario_id);
      if (!user) throw new UnauthorizedError('Usuário inexistente');

      await deps.refreshRepo.revokeById(rec.id);
      return issue(user, rec.family_id, device);
    },

    async revoke(rawRefresh: string): Promise<void> {
      const rec = await deps.refreshRepo.findByHash(hashToken(rawRefresh));
      if (rec && !rec.revoked_at) await deps.refreshRepo.revokeById(rec.id);
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
