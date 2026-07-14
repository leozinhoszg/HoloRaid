import type { UserRepo, UserRecord } from '../../src/db/repositories/userRepo';
import type { RefreshTokenRepo, RefreshRecord, NewRefresh } from '../../src/db/repositories/refreshTokenRepo';

export function makeFakeUserRepo(): UserRepo {
  const users: UserRecord[] = [];
  let seq = 1;
  return {
    async upsertByDiscordId(p) {
      const existing = users.find((u) => u.discord_id === p.discord_id);
      if (existing) {
        Object.assign(existing, { username: p.username, nickname: p.nickname, avatar: p.avatar, email: p.email });
        return { ...existing };
      }
      const rec: UserRecord = { id: seq++, ...p };
      users.push(rec);
      return { ...rec };
    },
    async findById(id) { return users.find((u) => u.id === id) ?? null; },
    async updateRole(id, role) { const u = users.find((x) => x.id === id); if (u) u.role = role; },
    async list() { return users.map((u) => ({ ...u })); },
  };
}

export function makeFakeRefreshTokenRepo(): RefreshTokenRepo & { _rows: (NewRefresh & { id: number; revoked_at: Date | null })[] } {
  const rows: (NewRefresh & { id: number; revoked_at: Date | null })[] = [];
  let seq = 1;
  return {
    _rows: rows,
    async create(row) { rows.push({ ...row, id: seq++, revoked_at: null }); },
    async findByHash(hash) {
      const r = rows.find((x) => x.token_hash === hash);
      return r ? ({ id: r.id, usuario_id: r.usuario_id, family_id: r.family_id, expires_at: r.expires_at, revoked_at: r.revoked_at } as RefreshRecord) : null;
    },
    async revokeById(id) { const r = rows.find((x) => x.id === id); if (r) r.revoked_at = new Date(); },
    async revokeFamily(familyId) { rows.filter((x) => x.family_id === familyId && !x.revoked_at).forEach((x) => (x.revoked_at = new Date())); },
  };
}
