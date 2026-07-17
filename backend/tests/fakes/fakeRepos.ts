import type { UserRepo, UserRecord } from '../../src/db/repositories/userRepo';
import type { RefreshTokenRepo, RefreshRecord, NewRefresh } from '../../src/db/repositories/refreshTokenRepo';
import type { PersonagemRepo, PersonagemRecord, PersonagemInput } from '../../src/db/repositories/personagemRepo';
import type { BossRepo, BossRecord } from '../../src/db/repositories/bossRepo';
import type { CharacterBossRepo, CompletedBossRow } from '../../src/db/repositories/characterBossRepo';
import type { RaidRepo, RaidRecord, NewRaid } from '../../src/db/repositories/raidRepo';
import type { RaidPlayerRepo, RaidPlayerRecord, RosterRow } from '../../src/db/repositories/raidPlayerRepo';
import type { GuildConfigRepo, GuildConfig } from '../../src/db/repositories/guildConfigRepo';
import type { RaidDiscordMessageRepo, RaidDiscordMessage, NewRaidDiscordMessage } from '../../src/db/repositories/raidDiscordMessageRepo';
import type { DeviceTokenRepo, DeviceToken } from '../../src/db/repositories/deviceTokenRepo';
import { BOSSES_SEED } from '../../src/reference/bossesSeed';

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

export function makeFakePersonagemRepo(): PersonagemRepo {
  const rows: PersonagemRecord[] = [];
  let seq = 1;
  return {
    async create(p: PersonagemInput) {
      const rec: PersonagemRecord = { id: seq++, total_points: 0, ...p };
      rows.push(rec);
      return { ...rec };
    },
    async findById(id) { return rows.find((r) => r.id === id) ?? null; },
    async findByUsuario(u) { return rows.filter((r) => r.usuario_id === u).map((r) => ({ ...r })); },
    async update(id, patch) { const r = rows.find((x) => x.id === id); if (r) Object.assign(r, patch); },
    async delete(id) { const i = rows.findIndex((x) => x.id === id); if (i >= 0) rows.splice(i, 1); },
    async updateTotalPoints(id, total) { const r = rows.find((x) => x.id === id); if (r) r.total_points = total; },
  };
}

// Fake bosses com ids 1..N a partir do seed (mesma ordem)
export function makeFakeBossRepo(): BossRepo {
  const rows: BossRecord[] = BOSSES_SEED.map((b, i) => ({ id: i + 1, ...b }));
  return {
    async list() { return rows.map((r) => ({ ...r })); },
    async findByIds(ids) { return rows.filter((r) => ids.includes(r.id)).map((r) => ({ ...r })); },
  };
}

export function makeFakeCharacterBossRepo(bossRepo: BossRepo): CharacterBossRepo {
  const completed = new Map<number, Set<number>>(); // personagemId -> bossIds
  return {
    async listBossIds(pid) { return [...(completed.get(pid) ?? new Set<number>())]; },
    async insertMany(pid, bossIds) {
      const set = completed.get(pid) ?? new Set<number>();
      bossIds.forEach((b) => set.add(b));
      completed.set(pid, set);
    },
    async deleteOne(pid, bossId) { completed.get(pid)?.delete(bossId); },
    async listWithBoss(pid) {
      const ids = [...(completed.get(pid) ?? new Set<number>())];
      const bosses = await bossRepo.findByIds(ids);
      return bosses.map((b) => ({ boss_id: b.id, operation: b.operation, boss: b.boss, difficulty: b.difficulty, type: b.type, points: b.points, completed_at: new Date(0) })) as CompletedBossRow[];
    },
  };
}

export function makeFakeRaidRepo(): RaidRepo {
  const rows: RaidRecord[] = [];
  let seq = 1;
  return {
    async create(r: NewRaid) { const rec: RaidRecord = { id: seq++, status: 'OPEN', ...r, disable_mentions: r.disable_mentions ?? false }; rows.push(rec); return { ...rec }; },
    async findById(id) { return rows.find((x) => x.id === id) ?? null; },
    async findByCodigo(codigo) { return rows.find((x) => x.codigo === codigo) ?? null; },
    async list(f) {
      return rows.filter((x) => (!f.status || x.status === f.status) && (!f.faction || x.faction === f.faction) && (!f.operation || x.operation === f.operation)).map((x) => ({ ...x }));
    },
    async update(id, patch) { const x = rows.find((r) => r.id === id); if (x) Object.assign(x, patch); },
    async updateStatus(id, status) { const x = rows.find((r) => r.id === id); if (x) x.status = status; },
    async delete(id) { const i = rows.findIndex((r) => r.id === id); if (i >= 0) rows.splice(i, 1); },
  };
}

// personagemRepo é usado só para montar o roster (nome/classe/pontos)
export function makeFakeRaidPlayerRepo(personagemRepo: PersonagemRepo): RaidPlayerRepo {
  const rows: RaidPlayerRecord[] = [];
  let seq = 1;
  return {
    async create(row) { rows.push({ id: seq++, ...row }); },
    async findByRaidAndUser(raidId, usuarioId) { return rows.find((r) => r.raid_id === raidId && r.usuario_id === usuarioId) ?? null; },
    async listByRaid(raidId) { return rows.filter((r) => r.raid_id === raidId).sort((a, b) => +a.joined_at - +b.joined_at).map((r) => ({ ...r })); },
    async listRoster(raidId) {
      const list = rows.filter((r) => r.raid_id === raidId).sort((a, b) => +a.joined_at - +b.joined_at);
      const out: RosterRow[] = [];
      for (const r of list) {
        const p = await personagemRepo.findById(r.personagem_id);
        out.push({ usuario_id: r.usuario_id, username: 'u' + r.usuario_id, avatar: null, personagem_id: r.personagem_id, nome: p?.nome ?? '?', classe: p?.classe ?? '?', especializacao: p?.especializacao ?? null, role: r.role, item_level: p?.item_level ?? 0, total_points: p?.total_points ?? 0, status: r.status, joined_at: r.joined_at });
      }
      return out;
    },
    async updateStatus(id, status) { const x = rows.find((r) => r.id === id); if (x) x.status = status; },
    async deleteByRaidAndUser(raidId, usuarioId) { const i = rows.findIndex((r) => r.raid_id === raidId && r.usuario_id === usuarioId); if (i >= 0) rows.splice(i, 1); },
  };
}

export function makeFakeGuildConfigRepo(): GuildConfigRepo {
  const rows: GuildConfig[] = [];
  return {
    async upsert(guild_id, raid_channel_id) {
      const x = rows.find((r) => r.guild_id === guild_id);
      if (x) x.raid_channel_id = raid_channel_id; else rows.push({ guild_id, raid_channel_id });
    },
    async list() { return rows.map((r) => ({ ...r })); },
    async findByGuild(guild_id) { return rows.find((r) => r.guild_id === guild_id) ?? null; },
  };
}

export function makeFakeRaidDiscordMessageRepo(): RaidDiscordMessageRepo {
  const rows: RaidDiscordMessage[] = [];
  let seq = 1;
  return {
    async create(row: NewRaidDiscordMessage) { rows.push({ id: seq++, ...row }); },
    async listByRaid(raid_id) { return rows.filter((r) => r.raid_id === raid_id).map((r) => ({ ...r })); },
    async deleteByRaid(raid_id) { for (let i = rows.length - 1; i >= 0; i--) if (rows[i]!.raid_id === raid_id) rows.splice(i, 1); },
  };
}

export function makeFakeDeviceTokenRepo(): DeviceTokenRepo & { _rows: DeviceToken[] } {
  const rows: DeviceToken[] = [];
  let seq = 1;
  return {
    _rows: rows,
    async upsert(usuario_id, token, platform) {
      const x = rows.find((r) => r.token === token);
      if (x) { x.usuario_id = usuario_id; x.platform = platform; }
      else rows.push({ id: seq++, usuario_id, token, platform });
    },
    async listByUsuarios(ids) { return rows.filter((r) => ids.includes(r.usuario_id)).map((r) => ({ ...r })); },
    async deleteByTokens(tokens) { for (let i = rows.length - 1; i >= 0; i--) if (tokens.includes(rows[i]!.token)) rows.splice(i, 1); },
  };
}
