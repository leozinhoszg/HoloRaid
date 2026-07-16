# Discord Bot: Fundação (#5a) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bot Discord multi-servidor para o HoloRaid: `/create_raid` + `/set_raid_channel` (inglês), posting/edição automática do embed em cada servidor configurado (broadcast) via barramento de eventos, e aviso de "raid cheia".

**Architecture:** Model do #4 (broadcast sobre REST) estendido para um `RaidEventBus` (fan-out de `RaidBroadcaster`): o socket-broadcaster (#4) e o novo `DiscordSync` são ouvintes; o controller/app do #4 não mudam. `DiscordSync` é best-effort (fire-and-forget) e fala com o Discord por um `DiscordGateway` (fake nos testes). O bot é opcional (sem token → no-op). Lógica testável com fakes; discord.js só no gateway/cliente (build + smoke manual).

**Tech Stack:** Node/TypeScript, discord.js ^14, Express, Kysely+mysql2, Zod, vitest+supertest. Flutter (só parametrização de URL + banner "cheia").

## Global Constraints

- **Bot opcional:** sem `DISCORD_BOT_TOKEN`, o bot não sobe e o `DiscordSync` é no-op; o app roda 100%.
- **Comandos e embeds em INGLÊS.** `/set_raid_channel` exige `Manage Guild`.
- **Conta auto-criada** via `userRepo.upsertByDiscordId` (reusa #1).
- **Broadcast:** toda raid posta no canal padrão de cada `guild_config`; uma raid → N linhas em `raid_discord_messages`; edição percorre todas.
- **Barramento:** `createRaidEventBus(...listeners: RaidBroadcaster[]): RaidBroadcaster`, cada chamada em try/catch. `raidFull` reusa `raidUpdated(detail, 'raidFull')` — **sem** alterar a interface `RaidBroadcaster`.
- **Raid cheia:** join confirmado que atinge a capacidade → `raidUpdated(detail,'raidFull')`. `isRaidFull`: com `check_composition`, cada role `confirmados>=slots`; senão `confirmados>=size`.
- **Fuso:** `timezone:'Z'` no mysql2; embed com `<t:unix:F>`; app com `.toLocal()`.
- **Best-effort:** falha do Discord é logada, nunca propaga.
- `APP_PUBLIC_URL` default `https://holoraid.fun`. Backend: `npm run build`/`typecheck` limpos; Flutter: `flutter analyze` limpo.

---

## Mapa de arquivos (novos, salvo indicação)

```
backend/src/
  config/index.ts                      # (MOD) + DISCORD_BOT_TOKEN?, APP_PUBLIC_URL
  db/db.ts                             # (MOD) + timezone:'Z'
  db/schema.ts                         # (MOD) + guild_config, raid_discord_messages
  db/migrations/004_discord.ts
  db/repositories/guildConfigRepo.ts
  db/repositories/raidDiscordMessageRepo.ts
  realtime/eventBus.ts                 # createRaidEventBus
  modules/raids/raids.service.ts       # (MOD) + isRaidFull
  modules/raids/raids.controller.ts    # (MOD) emite raidFull no join que enche
  discord/embed.ts                     # buildRaidEmbed (puro) + RaidEmbed
  discord/gateway.ts                   # DiscordGateway + noopGateway + createDiscordJsGateway
  discord/discordSync.ts               # createDiscordSyncCore + createDiscordSync (RaidBroadcaster)
  discord/commands.ts                  # handlers (sem discord.js): handleCreateRaid, handleSetRaidChannel
  discord/bot.ts                       # SlashCommandBuilder defs + adapter + attachBot (discord.js)
  server.ts                            # (MOD) wire repos/gateway/sync/bus/bot
backend/tests/
  eventBus.test.ts, isRaidFull.test.ts, raidFull.routes.test.ts,
  embed.test.ts, discordSync.test.ts, discordCommands.test.ts
  fakes/fakeRepos.ts                   # (MOD) + guildConfig/raidDiscordMessage fakes
  fakes/fakeDiscord.ts                 # fakeGateway + fakeInteraction

app/lib/
  core/config/app_config.dart          # (MOD) + appPublicUrl
  features/raids/raid_detail_screen.dart  # (MOD) share URL via AppConfig + banner "full"
```

---

# FASE A — Fundação (config, db, repos, bus)

### Task 1: Config (bot token + APP_PUBLIC_URL) + fuso UTC

**Files:**
- Modify: `backend/src/config/index.ts`
- Modify: `backend/src/db/db.ts`
- Test: `backend/tests/config.test.ts` (já existe; adicionar casos)

**Interfaces:**
- Consumes: nada novo.
- Produces: `AppConfig` ganha `DISCORD_BOT_TOKEN: string | undefined` e `APP_PUBLIC_URL: string`.

- [ ] **Step 1: Adicionar casos ao `backend/tests/config.test.ts`** (dentro do `describe('loadConfig')`)

```ts
  it('APP_PUBLIC_URL default é holoraid.fun e DISCORD_BOT_TOKEN é opcional', () => {
    const c = loadConfig(good as any);
    expect(c.APP_PUBLIC_URL).toBe('https://holoraid.fun');
    expect(c.DISCORD_BOT_TOKEN).toBeUndefined();
  });

  it('aceita DISCORD_BOT_TOKEN e APP_PUBLIC_URL customizados', () => {
    const c = loadConfig({ ...good, DISCORD_BOT_TOKEN: 'tok', APP_PUBLIC_URL: 'https://x.test' } as any);
    expect(c.DISCORD_BOT_TOKEN).toBe('tok');
    expect(c.APP_PUBLIC_URL).toBe('https://x.test');
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && npx vitest run tests/config.test.ts`
Expected: FAIL — campos não existem.

- [ ] **Step 3: Adicionar os campos ao `EnvSchema` em `backend/src/config/index.ts`** (após `CORS_ORIGINS`)

```ts
  DISCORD_BOT_TOKEN: z.string().min(1).optional(),
  APP_PUBLIC_URL: z.string().url().default('https://holoraid.fun'),
```

- [ ] **Step 4: Adicionar `timezone: 'Z'` em `backend/src/db/db.ts`** — dentro do `createPool({...})`

```ts
    pool: createPool({
      host: cfg.DB_HOST,
      port: cfg.DB_PORT,
      user: cfg.DB_USER,
      password: cfg.DB_PASSWORD,
      database: cfg.DB_NAME,
      connectionLimit: 10,
      timezone: 'Z',
    }) as unknown as MysqlPool,
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd backend && npx vitest run tests/config.test.ts && npm run typecheck`
Expected: PASS; typecheck exit 0.

- [ ] **Step 6: Commit**

```bash
git add backend/src/config/index.ts backend/src/db/db.ts backend/tests/config.test.ts
git commit -m "feat(config): DISCORD_BOT_TOKEN opcional + APP_PUBLIC_URL + timezone UTC no mysql2"
```

---

### Task 2: Schema + migration (guild_config, raid_discord_messages)

**Files:**
- Modify: `backend/src/db/schema.ts`
- Create: `backend/src/db/migrations/004_discord.ts`

**Interfaces:**
- Consumes: `DB` (schema).
- Produces: tabelas `guild_config`, `raid_discord_messages` + tipos no `DB`.

> Verificado por compilação; migration ao vivo é integração (MySQL).

- [ ] **Step 1: Adicionar tipos em `backend/src/db/schema.ts`** (antes de `export interface DB`)

```ts
export interface GuildConfigTable {
  guild_id: string;
  raid_channel_id: string;
  created_at: Created;
  updated_at: Updated;
}

export interface RaidDiscordMessagesTable {
  id: Generated<number>;
  raid_id: number;
  guild_id: string;
  channel_id: string;
  message_id: string;
  created_at: Created;
}
```

E acrescentar ao `interface DB`:

```ts
  guild_config: GuildConfigTable;
  raid_discord_messages: RaidDiscordMessagesTable;
```

- [ ] **Step 2: Verificar compilação**

Run: `cd backend && npm run typecheck`
Expected: exit 0.

- [ ] **Step 3: Implementar `backend/src/db/migrations/004_discord.ts`**

```ts
import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('guild_config')
    .addColumn('guild_id', 'varchar(32)', (c) => c.primaryKey())
    .addColumn('raid_channel_id', 'varchar(32)', (c) => c.notNull())
    .addColumn('created_at', 'datetime', (c) => c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn('updated_at', 'datetime', (c) => c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  await db.schema
    .createTable('raid_discord_messages')
    .addColumn('id', 'bigint', (c) => c.primaryKey().autoIncrement())
    .addColumn('raid_id', 'bigint', (c) => c.notNull().references('raids.id').onDelete('cascade'))
    .addColumn('guild_id', 'varchar(32)', (c) => c.notNull())
    .addColumn('channel_id', 'varchar(32)', (c) => c.notNull())
    .addColumn('message_id', 'varchar(32)', (c) => c.notNull())
    .addColumn('created_at', 'datetime', (c) => c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();
  await db.schema.createIndex('idx_rdm_raid').on('raid_discord_messages').column('raid_id').execute();
  await db.schema.createIndex('uq_rdm_raid_channel').on('raid_discord_messages').columns(['raid_id', 'channel_id']).unique().execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('raid_discord_messages').ifExists().execute();
  await db.schema.dropTable('guild_config').ifExists().execute();
}
```

- [ ] **Step 4: Build + migration**

Run: `cd backend && npm run build && npm run migrate`
Expected: build exit 0; `OK: 004_discord`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/db/schema.ts backend/src/db/migrations/004_discord.ts
git commit -m "feat(db): tabelas guild_config + raid_discord_messages"
```

---

### Task 3: Repositórios (guildConfig, raidDiscordMessage) + fakes

**Files:**
- Create: `backend/src/db/repositories/guildConfigRepo.ts`
- Create: `backend/src/db/repositories/raidDiscordMessageRepo.ts`
- Modify: `backend/tests/fakes/fakeRepos.ts`

**Interfaces:**
- Consumes: `db`/`DB`.
- Produces:
  - `type GuildConfig = { guild_id: string; raid_channel_id: string }`; `interface GuildConfigRepo { upsert(guild_id, raid_channel_id): Promise<void>; list(): Promise<GuildConfig[]>; findByGuild(guild_id): Promise<GuildConfig|null> }` + `createGuildConfigRepo(db)`.
  - `type RaidDiscordMessage = { id:number; raid_id:number; guild_id:string; channel_id:string; message_id:string }`; `type NewRaidDiscordMessage = Omit<RaidDiscordMessage,'id'>`; `interface RaidDiscordMessageRepo { create(row:NewRaidDiscordMessage):Promise<void>; listByRaid(raid_id):Promise<RaidDiscordMessage[]>; deleteByRaid(raid_id):Promise<void> }` + `createRaidDiscordMessageRepo(db)`.
  - Fakes: `makeFakeGuildConfigRepo()`, `makeFakeRaidDiscordMessageRepo()`.

- [ ] **Step 1: Implementar `backend/src/db/repositories/guildConfigRepo.ts`**

```ts
import type { Kysely } from 'kysely';
import type { DB } from '../schema';

export type GuildConfig = { guild_id: string; raid_channel_id: string };

export interface GuildConfigRepo {
  upsert(guild_id: string, raid_channel_id: string): Promise<void>;
  list(): Promise<GuildConfig[]>;
  findByGuild(guild_id: string): Promise<GuildConfig | null>;
}

export function createGuildConfigRepo(db: Kysely<DB>): GuildConfigRepo {
  return {
    async upsert(guild_id, raid_channel_id) {
      await db.insertInto('guild_config')
        .values({ guild_id, raid_channel_id, updated_at: new Date() })
        .onDuplicateKeyUpdate({ raid_channel_id, updated_at: new Date() })
        .execute();
    },
    async list() {
      return db.selectFrom('guild_config').select(['guild_id', 'raid_channel_id']).execute();
    },
    async findByGuild(guild_id) {
      const r = await db.selectFrom('guild_config').select(['guild_id', 'raid_channel_id']).where('guild_id', '=', guild_id).executeTakeFirst();
      return r ?? null;
    },
  };
}
```

- [ ] **Step 2: Implementar `backend/src/db/repositories/raidDiscordMessageRepo.ts`**

```ts
import type { Kysely } from 'kysely';
import type { DB } from '../schema';

export type RaidDiscordMessage = { id: number; raid_id: number; guild_id: string; channel_id: string; message_id: string };
export type NewRaidDiscordMessage = Omit<RaidDiscordMessage, 'id'>;

export interface RaidDiscordMessageRepo {
  create(row: NewRaidDiscordMessage): Promise<void>;
  listByRaid(raid_id: number): Promise<RaidDiscordMessage[]>;
  deleteByRaid(raid_id: number): Promise<void>;
}

const COLS = ['id', 'raid_id', 'guild_id', 'channel_id', 'message_id'] as const;

export function createRaidDiscordMessageRepo(db: Kysely<DB>): RaidDiscordMessageRepo {
  return {
    async create(row) {
      await db.insertInto('raid_discord_messages').values(row).execute();
    },
    async listByRaid(raid_id) {
      const rows = await db.selectFrom('raid_discord_messages').select(COLS).where('raid_id', '=', raid_id).execute();
      return rows as RaidDiscordMessage[];
    },
    async deleteByRaid(raid_id) {
      await db.deleteFrom('raid_discord_messages').where('raid_id', '=', raid_id).execute();
    },
  };
}
```

- [ ] **Step 3: Adicionar fakes em `backend/tests/fakes/fakeRepos.ts`** (imports no topo + funções no fim)

Imports no topo:

```ts
import type { GuildConfigRepo, GuildConfig } from '../../src/db/repositories/guildConfigRepo';
import type { RaidDiscordMessageRepo, RaidDiscordMessage, NewRaidDiscordMessage } from '../../src/db/repositories/raidDiscordMessageRepo';
```

Ao final:

```ts
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
```

- [ ] **Step 4: Verificar compilação**

Run: `cd backend && npm run typecheck`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add backend/src/db/repositories/guildConfigRepo.ts backend/src/db/repositories/raidDiscordMessageRepo.ts backend/tests/fakes/fakeRepos.ts
git commit -m "feat(db): repositórios guildConfig + raidDiscordMessage + fakes"
```

---

### Task 4: RaidEventBus + isRaidFull

**Files:**
- Create: `backend/src/realtime/eventBus.ts`
- Modify: `backend/src/modules/raids/raids.service.ts`
- Test: `backend/tests/eventBus.test.ts`, `backend/tests/isRaidFull.test.ts`

**Interfaces:**
- Consumes: `RaidBroadcaster` (#4), `RaidDetail` (#3).
- Produces:
  - `createRaidEventBus(...listeners: RaidBroadcaster[]): RaidBroadcaster` — fan-out com try/catch por ouvinte.
  - `isRaidFull(detail: RaidDetail): boolean` (export em `raids.service.ts`).

- [ ] **Step 1: Escrever `backend/tests/eventBus.test.ts`**

```ts
import { createRaidEventBus } from '../src/realtime/eventBus';
import type { RaidBroadcaster } from '../src/realtime/broadcaster';

function recorder() {
  const calls: string[] = [];
  const b: RaidBroadcaster = {
    raidCreated: () => calls.push('created'),
    raidUpdated: (_d, e) => calls.push('updated:' + e),
    raidRemoved: () => calls.push('removed'),
  };
  return { b, calls };
}
const detail = { id: 1, roster: [] } as any;

describe('RaidEventBus', () => {
  it('faz fan-out para todos os ouvintes', () => {
    const a = recorder(); const b = recorder();
    const bus = createRaidEventBus(a.b, b.b);
    bus.raidCreated(detail);
    bus.raidUpdated(detail, 'playerJoined');
    bus.raidRemoved(1);
    expect(a.calls).toEqual(['created', 'updated:playerJoined', 'removed']);
    expect(b.calls).toEqual(['created', 'updated:playerJoined', 'removed']);
  });

  it('um ouvinte que lança não impede os outros', () => {
    const bad: RaidBroadcaster = { raidCreated: () => { throw new Error('x'); }, raidUpdated: () => {}, raidRemoved: () => {} };
    const good = recorder();
    const bus = createRaidEventBus(bad, good.b);
    expect(() => bus.raidCreated(detail)).not.toThrow();
    expect(good.calls).toEqual(['created']);
  });
});
```

- [ ] **Step 2: Escrever `backend/tests/isRaidFull.test.ts`**

```ts
import { isRaidFull } from '../src/modules/raids/raids.service';

const base = (over: any) => ({ id: 1, size: 8, check_composition: false, slots_tank: 2, slots_heal: 2, slots_dps: 4, roster: [], ...over } as any);
const player = (role: string, status = 'confirmed') => ({ role, status });

describe('isRaidFull', () => {
  it('headcount: cheio quando confirmados == size', () => {
    expect(isRaidFull(base({ roster: Array.from({ length: 8 }, () => player('DPS')) }))).toBe(true);
    expect(isRaidFull(base({ roster: Array.from({ length: 7 }, () => player('DPS')) }))).toBe(false);
  });

  it('waitlist não conta no headcount', () => {
    const roster = [...Array.from({ length: 7 }, () => player('DPS')), player('DPS', 'waitlist')];
    expect(isRaidFull(base({ roster }))).toBe(false);
  });

  it('check_composition: cheio quando cada role bate sua quota', () => {
    const full = base({ check_composition: true, roster: [player('Tank'), player('Tank'), player('Healer'), player('Healer'), player('DPS'), player('DPS'), player('DPS'), player('DPS')] });
    expect(isRaidFull(full)).toBe(true);
    const missingTank = base({ check_composition: true, roster: [player('Tank'), player('Healer'), player('Healer'), player('DPS'), player('DPS'), player('DPS'), player('DPS')] });
    expect(isRaidFull(missingTank)).toBe(false);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `cd backend && npx vitest run tests/eventBus.test.ts tests/isRaidFull.test.ts`
Expected: FAIL — módulos/exports não existem.

- [ ] **Step 4: Implementar `backend/src/realtime/eventBus.ts`**

```ts
import type { RaidBroadcaster } from './broadcaster';
import type { RaidDetail } from '../modules/raids/raids.service';
import { logger } from '../common/logger/logger';

export function createRaidEventBus(...listeners: RaidBroadcaster[]): RaidBroadcaster {
  const safe = (fn: () => void) => {
    try { fn(); } catch (err) { logger.error({ err }, 'RaidEventBus: ouvinte falhou'); }
  };
  return {
    raidCreated(detail: RaidDetail) { for (const l of listeners) safe(() => l.raidCreated(detail)); },
    raidUpdated(detail, event) { for (const l of listeners) safe(() => l.raidUpdated(detail, event)); },
    raidRemoved(id) { for (const l of listeners) safe(() => l.raidRemoved(id)); },
  };
}
```

- [ ] **Step 5: Adicionar `isRaidFull` em `backend/src/modules/raids/raids.service.ts`** (após a definição de `RaidDetail`)

```ts
export function isRaidFull(detail: RaidDetail): boolean {
  const confirmed = detail.roster.filter((r) => r.status === 'confirmed');
  if (detail.check_composition) {
    const byRole = (role: string) => confirmed.filter((r) => r.role === role).length;
    return byRole('Tank') >= detail.slots_tank && byRole('Healer') >= detail.slots_heal && byRole('DPS') >= detail.slots_dps;
  }
  return confirmed.length >= detail.size;
}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `cd backend && npx vitest run tests/eventBus.test.ts tests/isRaidFull.test.ts && npm run typecheck`
Expected: PASS; typecheck exit 0.

- [ ] **Step 7: Commit**

```bash
git add backend/src/realtime/eventBus.ts backend/src/modules/raids/raids.service.ts backend/tests/eventBus.test.ts backend/tests/isRaidFull.test.ts
git commit -m "feat(realtime): RaidEventBus (fan-out) + isRaidFull"
```

---

### Task 5: Controller emite `raidFull` no join que enche

**Files:**
- Modify: `backend/src/modules/raids/raids.controller.ts`
- Test: `backend/tests/raidFull.routes.test.ts`

**Interfaces:**
- Consumes: `isRaidFull` (Task 4), `RaidBroadcaster` espião.
- Produces: no `join`, após `playerJoined`, se `result.status==='confirmed' && isRaidFull(detail)` → `broadcaster.raidUpdated(detail,'raidFull')`.

- [ ] **Step 1: Escrever `backend/tests/raidFull.routes.test.ts`**

```ts
import request from 'supertest';
import { createApp } from '../src/app';
import { makeFakeRaidRepo, makeFakeRaidPlayerRepo, makeFakePersonagemRepo } from './fakes/fakeRepos';
import { createRaidService } from '../src/modules/raids/raids.service';
import { createRaidJoinService } from '../src/modules/raids/raidJoin.service';
import type { RaidBroadcaster } from '../src/realtime/broadcaster';
import { signAccessToken } from '../src/common/security/jwt';

beforeAll(() => {
  process.env.JWT_SECRET = 'z'.repeat(40); process.env.DISCORD_CLIENT_ID = 'C';
  process.env.DISCORD_CLIENT_SECRET = 'S'; process.env.DISCORD_REDIRECT_URI = 'http://localhost/cb';
  process.env.CORS_ORIGINS = 'http://localhost:8080';
});

function build() {
  const raidRepo = makeFakeRaidRepo();
  const personagemRepo = makeFakePersonagemRepo();
  const raidPlayerRepo = makeFakeRaidPlayerRepo(personagemRepo);
  const raidService = createRaidService({ raidRepo, raidPlayerRepo });
  const raidJoinService = createRaidJoinService({ raidRepo, raidPlayerRepo, personagemRepo });
  const events: string[] = [];
  const broadcaster: RaidBroadcaster = {
    raidCreated: () => events.push('created'),
    raidUpdated: (_d, e) => events.push(e),
    raidRemoved: () => events.push('removed'),
  };
  const app = createApp({ authService: {} as any, raidService, raidJoinService, broadcaster });
  return { app, raidService, personagemRepo, events };
}
const tok = (sub: number) => signAccessToken({ sub, role: 'user' });

describe('raidFull', () => {
  it('o join que enche dispara raidUpdated(raidFull)', async () => {
    const { app, raidService, personagemRepo, events } = build();
    // size 2 para encher rápido (slots 1 tank / 0 heal / 1 dps somam 2)
    const raid = await raidService.create({ sub: 1, role: 'user' }, {
      operation: 'Dread Palace', difficulty: 'HM', size: 2, faction: 'Republic', minimum_tier: 0,
      check_composition: false, slots_tank: 1, slots_heal: 0, slots_dps: 1, notes: null, start_at: new Date('2026-08-01T20:30:00Z'),
    });
    const mk = (uid: number) => personagemRepo.create({ usuario_id: uid, nome: 'P' + uid, faccao: 'Republic', classe: 'Sentinel', especializacao: null, role: 'DPS', origin_story: null, item_level: 330 });
    const p1 = await mk(10); const p2 = await mk(11);
    await request(app).post(`/raids/${raid.id}/join`).set('Authorization', `Bearer ${tok(10)}`).send({ personagem_id: p1.id });
    expect(events).not.toContain('raidFull');
    await request(app).post(`/raids/${raid.id}/join`).set('Authorization', `Bearer ${tok(11)}`).send({ personagem_id: p2.id });
    expect(events).toContain('raidFull');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && npx vitest run tests/raidFull.routes.test.ts`
Expected: FAIL — `raidFull` não é emitido.

- [ ] **Step 3: Modificar o `join` em `backend/src/modules/raids/raids.controller.ts`**

Importar `isRaidFull` no topo:

```ts
import { noopBroadcaster, type RaidBroadcaster } from '../../realtime/broadcaster';
import { isRaidFull } from './raids.service';
```

E trocar o método `join`:

```ts
    async join(req: Request, res: Response) {
      const id = Number(req.params.id);
      const { personagem_id } = req.body as { personagem_id: number };
      const result = await raidJoinService.join(req.user!.sub, id, personagem_id);
      const detail = await raidService.getDetail(id);
      broadcaster.raidUpdated(detail, 'playerJoined');
      if (result.status === 'confirmed' && isRaidFull(detail)) broadcaster.raidUpdated(detail, 'raidFull');
      res.json(result);
    },
```

> **Nota:** `isRaidFull` já é importado do mesmo módulo `raids.service` de onde vem `RaidService`; garanta o import nomeado.

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && npx vitest run tests/raidFull.routes.test.ts tests/raids.routes.test.ts && npm run typecheck`
Expected: PASS (raidFull + os 6 de rotas do #3); typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/raids/raids.controller.ts backend/tests/raidFull.routes.test.ts
git commit -m "feat(raids): emite raidFull quando um join confirma e enche a raid"
```

---

# FASE B — Domínio Discord (embed, sync)

### Task 6: Embed builder

**Files:**
- Create: `backend/src/discord/embed.ts`
- Test: `backend/tests/embed.test.ts`

**Interfaces:**
- Consumes: `RaidDetail` (#3).
- Produces:
  - `interface RaidEmbed { title: string; fields: { name: string; value: string }[]; joinUrl: string }`.
  - `buildRaidEmbed(detail: RaidDetail, appPublicUrl: string): RaidEmbed`.

- [ ] **Step 1: Escrever `backend/tests/embed.test.ts`**

```ts
import { buildRaidEmbed } from '../src/discord/embed';

const detail = {
  id: 1, codigo: 'ABC123', operation: 'Dread Palace', difficulty: 'HM', size: 8, faction: 'Republic',
  minimum_tier: 2, check_composition: false, slots_tank: 2, slots_heal: 2, slots_dps: 4, notes: null,
  start_at: new Date('2026-08-01T20:30:00Z'), status: 'OPEN', created_by: 1,
  roster: [{ status: 'confirmed', role: 'DPS' }, { status: 'waitlist', role: 'DPS' }],
} as any;

describe('buildRaidEmbed', () => {
  it('monta título, link e campos em inglês', () => {
    const e = buildRaidEmbed(detail, 'https://holoraid.fun');
    expect(e.title).toContain('HoloRaid');
    expect(e.joinUrl).toBe('https://holoraid.fun/r/ABC123');
    const f = Object.fromEntries(e.fields.map((x) => [x.name, x.value]));
    expect(f['Operation']).toBe('Dread Palace');
    expect(f['Difficulty']).toBe('Veteran');
    expect(f['Faction']).toBe('Republic');
    expect(f['Minimum Tier']).toBe('Tier 2');
    expect(f['Signed']).toBe('1/8'); // só confirmados
    expect(f['Status']).toBe('OPEN');
  });

  it('usa timestamp do Discord (<t:unix>) para o horário', () => {
    const e = buildRaidEmbed(detail, 'https://holoraid.fun');
    const time = e.fields.find((x) => x.name === 'Time')!.value;
    const unix = Math.floor(new Date('2026-08-01T20:30:00Z').getTime() / 1000);
    expect(time).toContain(`<t:${unix}:F>`);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && npx vitest run tests/embed.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `backend/src/discord/embed.ts`**

```ts
import type { RaidDetail } from '../modules/raids/raids.service';

export interface RaidEmbed {
  title: string;
  fields: { name: string; value: string }[];
  joinUrl: string;
}

const DIFF: Record<string, string> = { SM: 'Story Mode', HM: 'Veteran', NiM: 'Master' };

export function buildRaidEmbed(detail: RaidDetail, appPublicUrl: string): RaidEmbed {
  const confirmed = detail.roster.filter((r) => r.status === 'confirmed').length;
  const unix = Math.floor(new Date(detail.start_at).getTime() / 1000);
  return {
    title: 'New Raid — HoloRaid',
    fields: [
      { name: 'Operation', value: detail.operation },
      { name: 'Difficulty', value: DIFF[detail.difficulty] ?? detail.difficulty },
      { name: 'Size', value: `${detail.size} players` },
      { name: 'Faction', value: detail.faction },
      { name: 'Minimum Tier', value: detail.minimum_tier === 0 ? 'None' : `Tier ${detail.minimum_tier}` },
      { name: 'Time', value: `<t:${unix}:F> (<t:${unix}:R>)` },
      { name: 'Signed', value: `${confirmed}/${detail.size}` },
      { name: 'Status', value: detail.status },
    ],
    joinUrl: `${appPublicUrl}/r/${detail.codigo}`,
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && npx vitest run tests/embed.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add backend/src/discord/embed.ts backend/tests/embed.test.ts
git commit -m "feat(discord): construtor de embed de raid (inglês + timestamp Discord)"
```

---

### Task 7: DiscordGateway + DiscordSync

**Files:**
- Create: `backend/src/discord/gateway.ts`
- Create: `backend/src/discord/discordSync.ts`
- Create: `backend/tests/fakes/fakeDiscord.ts`
- Test: `backend/tests/discordSync.test.ts`

**Interfaces:**
- Consumes: `RaidEmbed`/`buildRaidEmbed` (Task 6), `GuildConfigRepo`/`RaidDiscordMessageRepo` (Task 3), `RaidBroadcaster` (#4), `discord.js` (só na impl real).
- Produces:
  - `interface DiscordGateway { postEmbed(channelId, embed): Promise<string>; editEmbed(channelId, messageId, embed): Promise<void>; deleteMessage(channelId, messageId): Promise<void>; postMessage(channelId, content): Promise<void> }`; `noopGateway`; `createDiscordJsGateway(client): DiscordGateway`.
  - `createDiscordSyncCore(deps): { onCreated(detail): Promise<void>; onUpdated(detail, event): Promise<void>; onRemoved(id): Promise<void> }`.
  - `createDiscordSync(deps): RaidBroadcaster` (wrapper fire-and-forget). `deps = { gateway, guildConfigRepo, msgRepo, appPublicUrl }`.
  - Fake: `makeFakeGateway()` (grava chamadas).

- [ ] **Step 1: Instalar discord.js**

Run: `cd backend && npm install discord.js@^14.16.3`
Expected: instala.

- [ ] **Step 2: Implementar `backend/tests/fakes/fakeDiscord.ts`**

```ts
import type { DiscordGateway } from '../../src/discord/gateway';
import type { RaidEmbed } from '../../src/discord/embed';

export type GatewayCall =
  | { kind: 'post'; channelId: string; embed: RaidEmbed }
  | { kind: 'edit'; channelId: string; messageId: string; embed: RaidEmbed }
  | { kind: 'delete'; channelId: string; messageId: string }
  | { kind: 'message'; channelId: string; content: string };

export function makeFakeGateway(opts: { failChannels?: string[] } = {}): DiscordGateway & { calls: GatewayCall[] } {
  const calls: GatewayCall[] = [];
  let seq = 1;
  const failIf = (channelId: string) => { if (opts.failChannels?.includes(channelId)) throw new Error('boom ' + channelId); };
  return {
    calls,
    async postEmbed(channelId, embed) { failIf(channelId); calls.push({ kind: 'post', channelId, embed }); return 'msg-' + seq++; },
    async editEmbed(channelId, messageId, embed) { failIf(channelId); calls.push({ kind: 'edit', channelId, messageId, embed }); },
    async deleteMessage(channelId, messageId) { failIf(channelId); calls.push({ kind: 'delete', channelId, messageId }); },
    async postMessage(channelId, content) { failIf(channelId); calls.push({ kind: 'message', channelId, content }); },
  };
}
```

- [ ] **Step 3: Escrever `backend/tests/discordSync.test.ts`**

```ts
import { createDiscordSyncCore } from '../src/discord/discordSync';
import { makeFakeGuildConfigRepo, makeFakeRaidDiscordMessageRepo } from './fakes/fakeRepos';
import { makeFakeGateway } from './fakes/fakeDiscord';

const detail = (over: any = {}) => ({ id: 7, codigo: 'X7', operation: 'Dread Palace', difficulty: 'HM', size: 8, faction: 'Republic', minimum_tier: 0, check_composition: false, slots_tank: 2, slots_heal: 2, slots_dps: 4, notes: null, start_at: new Date('2026-08-01T20:30:00Z'), status: 'OPEN', created_by: 1, roster: [], ...over } as any);

async function setup(opts: { failChannels?: string[] } = {}) {
  const guildConfigRepo = makeFakeGuildConfigRepo();
  const msgRepo = makeFakeRaidDiscordMessageRepo();
  const gateway = makeFakeGateway(opts);
  await guildConfigRepo.upsert('g1', 'c1');
  await guildConfigRepo.upsert('g2', 'c2');
  const core = createDiscordSyncCore({ gateway, guildConfigRepo, msgRepo, appPublicUrl: 'https://holoraid.fun' });
  return { core, gateway, msgRepo };
}

describe('DiscordSync', () => {
  it('onCreated posta em cada servidor e grava as refs', async () => {
    const { core, gateway, msgRepo } = await setup();
    await core.onCreated(detail());
    expect(gateway.calls.filter((c) => c.kind === 'post')).toHaveLength(2);
    expect(await msgRepo.listByRaid(7)).toHaveLength(2);
  });

  it('onUpdated edita cada mensagem; raidFull também posta a mensagem "full"', async () => {
    const { core, gateway, msgRepo } = await setup();
    await core.onCreated(detail());
    await core.onUpdated(detail({ roster: [{ status: 'confirmed', role: 'DPS' }] }), 'playerJoined');
    expect(gateway.calls.filter((c) => c.kind === 'edit')).toHaveLength(2);
    expect(gateway.calls.filter((c) => c.kind === 'message')).toHaveLength(0);
    await core.onUpdated(detail(), 'raidFull');
    expect(gateway.calls.filter((c) => c.kind === 'message')).toHaveLength(2);
    expect(await msgRepo.listByRaid(7)).toHaveLength(2); // não duplica
  });

  it('onRemoved apaga as mensagens e limpa as refs', async () => {
    const { core, gateway, msgRepo } = await setup();
    await core.onCreated(detail());
    await core.onRemoved(7);
    expect(gateway.calls.filter((c) => c.kind === 'delete')).toHaveLength(2);
    expect(await msgRepo.listByRaid(7)).toHaveLength(0);
  });

  it('best-effort: um servidor falhando não impede os outros', async () => {
    const { core, msgRepo } = await setup({ failChannels: ['c1'] });
    await core.onCreated(detail());
    // c1 falhou; c2 gravou
    const refs = await msgRepo.listByRaid(7);
    expect(refs).toHaveLength(1);
    expect(refs[0]!.channel_id).toBe('c2');
  });
});
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `cd backend && npx vitest run tests/discordSync.test.ts`
Expected: FAIL — módulos não existem.

- [ ] **Step 5: Implementar `backend/src/discord/gateway.ts`**

```ts
import { Client, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, type TextChannel } from 'discord.js';
import type { RaidEmbed } from './embed';

export interface DiscordGateway {
  postEmbed(channelId: string, embed: RaidEmbed): Promise<string>;
  editEmbed(channelId: string, messageId: string, embed: RaidEmbed): Promise<void>;
  deleteMessage(channelId: string, messageId: string): Promise<void>;
  postMessage(channelId: string, content: string): Promise<void>;
}

export const noopGateway: DiscordGateway = {
  async postEmbed() { return ''; },
  async editEmbed() {},
  async deleteMessage() {},
  async postMessage() {},
};

function render(embed: RaidEmbed) {
  const e = new EmbedBuilder().setTitle(embed.title);
  for (const f of embed.fields) e.addFields({ name: f.name, value: f.value, inline: true });
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setLabel('Join').setStyle(ButtonStyle.Link).setURL(embed.joinUrl),
  );
  return { embeds: [e], components: [row] };
}

export function createDiscordJsGateway(client: Client): DiscordGateway {
  const channel = async (id: string) => (await client.channels.fetch(id)) as TextChannel;
  return {
    async postEmbed(channelId, embed) {
      const msg = await (await channel(channelId)).send(render(embed));
      return msg.id;
    },
    async editEmbed(channelId, messageId, embed) {
      const ch = await channel(channelId);
      const msg = await ch.messages.fetch(messageId);
      await msg.edit(render(embed));
    },
    async deleteMessage(channelId, messageId) {
      const ch = await channel(channelId);
      const msg = await ch.messages.fetch(messageId);
      await msg.delete();
    },
    async postMessage(channelId, content) {
      await (await channel(channelId)).send(content);
    },
  };
}
```

- [ ] **Step 6: Implementar `backend/src/discord/discordSync.ts`**

```ts
import type { RaidBroadcaster } from '../realtime/broadcaster';
import type { RaidDetail } from '../modules/raids/raids.service';
import type { DiscordGateway } from './gateway';
import type { GuildConfigRepo } from '../db/repositories/guildConfigRepo';
import type { RaidDiscordMessageRepo } from '../db/repositories/raidDiscordMessageRepo';
import { buildRaidEmbed } from './embed';
import { logger } from '../common/logger/logger';

type Deps = {
  gateway: DiscordGateway;
  guildConfigRepo: GuildConfigRepo;
  msgRepo: RaidDiscordMessageRepo;
  appPublicUrl: string;
};

export function createDiscordSyncCore(deps: Deps) {
  return {
    async onCreated(detail: RaidDetail): Promise<void> {
      const embed = buildRaidEmbed(detail, deps.appPublicUrl);
      for (const g of await deps.guildConfigRepo.list()) {
        try {
          const messageId = await deps.gateway.postEmbed(g.raid_channel_id, embed);
          await deps.msgRepo.create({ raid_id: detail.id, guild_id: g.guild_id, channel_id: g.raid_channel_id, message_id: messageId });
        } catch (err) { logger.error({ err, guild: g.guild_id }, 'discord: post falhou'); }
      }
    },
    async onUpdated(detail: RaidDetail, event: string): Promise<void> {
      const embed = buildRaidEmbed(detail, deps.appPublicUrl);
      for (const m of await deps.msgRepo.listByRaid(detail.id)) {
        try {
          await deps.gateway.editEmbed(m.channel_id, m.message_id, embed);
          if (event === 'raidFull') await deps.gateway.postMessage(m.channel_id, '🔴 Raid full — starting soon!');
        } catch (err) { logger.error({ err, channel: m.channel_id }, 'discord: edit falhou'); }
      }
    },
    async onRemoved(id: number): Promise<void> {
      for (const m of await deps.msgRepo.listByRaid(id)) {
        try { await deps.gateway.deleteMessage(m.channel_id, m.message_id); }
        catch (err) { logger.error({ err, channel: m.channel_id }, 'discord: delete falhou'); }
      }
      await deps.msgRepo.deleteByRaid(id);
    },
  };
}

export function createDiscordSync(deps: Deps): RaidBroadcaster {
  const core = createDiscordSyncCore(deps);
  const run = (p: Promise<unknown>) => { p.catch((err) => logger.error({ err }, 'discord sync falhou')); };
  return {
    raidCreated(detail) { run(core.onCreated(detail)); },
    raidUpdated(detail, event) { run(core.onUpdated(detail, event)); },
    raidRemoved(id) { run(core.onRemoved(id)); },
  };
}
```

- [ ] **Step 7: Rodar e ver passar + build**

Run: `cd backend && npx vitest run tests/discordSync.test.ts && npm run build`
Expected: PASS (4 testes); build exit 0.

- [ ] **Step 8: Commit**

```bash
git add backend/src/discord/gateway.ts backend/src/discord/discordSync.ts backend/tests/fakes/fakeDiscord.ts backend/tests/discordSync.test.ts backend/package.json backend/package-lock.json
git commit -m "feat(discord): DiscordGateway (discord.js) + DiscordSync best-effort"
```

---

# FASE C — Bot (comandos, cliente, wiring)

### Task 8: Handlers dos comandos (sem discord.js)

**Files:**
- Create: `backend/src/discord/commands.ts`
- Test: `backend/tests/discordCommands.test.ts`

**Interfaces:**
- Consumes: `raidCreateSchema` (#3), `defaultSlots` (#3 `raids.util`), `RaidService` (#3), `UserRepo` (#1), `RaidBroadcaster` (#4).
- Produces:
  - `interface CommandInteraction { user: { id: string; username: string }; guildId: string | null; channelId: string; memberPermissions: { has(p: string): boolean } | null; getString(n: string): string | null; getInteger(n: string): number | null; getBoolean(n: string): boolean | null; reply(m: { content: string; ephemeral?: boolean }): Promise<void> }`.
  - `type CommandDeps = { raidService: RaidService; userRepo: UserRepo; guildConfigRepo: GuildConfigRepo; bus: RaidBroadcaster }`.
  - `handleSetRaidChannel(i, deps): Promise<void>`; `handleCreateRaid(i, deps): Promise<void>`.

- [ ] **Step 1: Escrever `backend/tests/discordCommands.test.ts`**

```ts
import { handleCreateRaid, handleSetRaidChannel, type CommandInteraction } from '../src/discord/commands';
import { makeFakeGuildConfigRepo, makeFakeRaidRepo, makeFakeRaidPlayerRepo, makeFakePersonagemRepo, makeFakeUserRepo } from './fakes/fakeRepos';
import { createRaidService } from '../src/modules/raids/raids.service';
import type { RaidBroadcaster } from '../src/realtime/broadcaster';

beforeAll(() => { process.env.JWT_SECRET = 'z'.repeat(40); process.env.DISCORD_CLIENT_ID = 'C'; process.env.DISCORD_CLIENT_SECRET = 'S'; process.env.DISCORD_REDIRECT_URI = 'http://localhost/cb'; });

function deps() {
  const guildConfigRepo = makeFakeGuildConfigRepo();
  const userRepo = makeFakeUserRepo();
  const personagemRepo = makeFakePersonagemRepo();
  const raidRepo = makeFakeRaidRepo();
  const raidPlayerRepo = makeFakeRaidPlayerRepo(personagemRepo);
  const raidService = createRaidService({ raidRepo, raidPlayerRepo });
  const created: string[] = [];
  const bus: RaidBroadcaster = { raidCreated: () => created.push('created'), raidUpdated: () => {}, raidRemoved: () => {} };
  return { d: { raidService, userRepo, guildConfigRepo, bus }, guildConfigRepo, raidRepo, created };
}

function fakeInteraction(over: Partial<CommandInteraction> & { opts?: Record<string, any> } = {}): CommandInteraction & { replies: any[] } {
  const replies: any[] = [];
  const opts = over.opts ?? {};
  return {
    user: over.user ?? { id: 'd123', username: 'diego' },
    guildId: over.guildId ?? 'g1',
    channelId: over.channelId ?? 'c1',
    memberPermissions: over.memberPermissions ?? { has: () => true },
    getString: (n) => (opts[n] ?? null),
    getInteger: (n) => (opts[n] ?? null),
    getBoolean: (n) => (opts[n] ?? null),
    reply: async (m) => { replies.push(m); },
    replies,
  };
}

describe('/set_raid_channel', () => {
  it('sem Manage Guild recusa', async () => {
    const { d } = deps();
    const i = fakeInteraction({ memberPermissions: { has: () => false } });
    await handleSetRaidChannel(i, d);
    expect(i.replies[0].content).toMatch(/Manage Server/);
    expect(await d.guildConfigRepo.findByGuild('g1')).toBeNull();
  });
  it('com permissão grava o canal', async () => {
    const { d } = deps();
    const i = fakeInteraction({ guildId: 'g1', channelId: 'c9' });
    await handleSetRaidChannel(i, d);
    expect((await d.guildConfigRepo.findByGuild('g1'))!.raid_channel_id).toBe('c9');
  });
});

describe('/create_raid', () => {
  const goodOpts = { operation: 'Dread Palace', difficulty: 'HM', size: 8, faction: 'Republic', minimum_tier: 0, date: '2026-08-01', time: '20:30' };
  it('cria a raid, auto-cria o usuário e emite no bus', async () => {
    const { d, raidRepo, created } = deps();
    const i = fakeInteraction({ opts: goodOpts });
    await handleCreateRaid(i, d);
    expect((await raidRepo.list({})).length).toBe(1);
    expect(created).toContain('created');
    expect(i.replies[0].content).toMatch(/created/i);
  });
  it('opções inválidas → erro efêmero, sem criar', async () => {
    const { d, raidRepo } = deps();
    const i = fakeInteraction({ opts: { ...goodOpts, operation: 'Inexistente' } });
    await handleCreateRaid(i, d);
    expect((await raidRepo.list({})).length).toBe(0);
    expect(i.replies[0].ephemeral).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && npx vitest run tests/discordCommands.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `backend/src/discord/commands.ts`**

```ts
import { raidCreateSchema } from '../modules/raids/raids.schemas';
import { defaultSlots } from '../modules/raids/raids.util';
import type { RaidService } from '../modules/raids/raids.service';
import type { UserRepo } from '../db/repositories/userRepo';
import type { GuildConfigRepo } from '../db/repositories/guildConfigRepo';
import type { RaidBroadcaster } from '../realtime/broadcaster';

export interface CommandInteraction {
  user: { id: string; username: string };
  guildId: string | null;
  channelId: string;
  memberPermissions: { has(perm: string): boolean } | null;
  getString(name: string): string | null;
  getInteger(name: string): number | null;
  getBoolean(name: string): boolean | null;
  reply(m: { content: string; ephemeral?: boolean }): Promise<void>;
}

export type CommandDeps = {
  raidService: RaidService;
  userRepo: UserRepo;
  guildConfigRepo: GuildConfigRepo;
  bus: RaidBroadcaster;
};

export async function handleSetRaidChannel(i: CommandInteraction, deps: CommandDeps): Promise<void> {
  if (!i.guildId) { await i.reply({ content: 'Use this command in a server.', ephemeral: true }); return; }
  if (!i.memberPermissions?.has('ManageGuild')) {
    await i.reply({ content: 'You need the **Manage Server** permission to do this.', ephemeral: true });
    return;
  }
  await deps.guildConfigRepo.upsert(i.guildId, i.channelId);
  await i.reply({ content: 'Raid announcements will be posted in this channel. ✅', ephemeral: true });
}

function parseStartAt(date: string | null, time: string | null): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? '');
  const t = /^(\d{1,2}):(\d{2})$/.exec(time ?? '');
  if (!d || !t) return null;
  const dt = new Date(Date.UTC(+d[1]!, +d[2]! - 1, +d[3]!, +t[1]!, +t[2]!));
  return isNaN(dt.getTime()) ? null : dt;
}

export async function handleCreateRaid(i: CommandInteraction, deps: CommandDeps): Promise<void> {
  const size = i.getInteger('size') ?? 8;
  const startAt = parseStartAt(i.getString('date'), i.getString('time'));
  if (!startAt) { await i.reply({ content: 'Invalid date/time. Use date `YYYY-MM-DD` and time `HH:MM` (UTC).', ephemeral: true }); return; }

  const input = {
    operation: i.getString('operation'),
    difficulty: i.getString('difficulty'),
    size,
    faction: i.getString('faction'),
    minimum_tier: i.getInteger('minimum_tier') ?? 0,
    check_composition: i.getBoolean('check_composition') ?? false,
    ...defaultSlots(size),
    notes: i.getString('notes') ?? null,
    start_at: startAt,
  };

  const parsed = raidCreateSchema.safeParse(input);
  if (!parsed.success) { await i.reply({ content: 'Invalid options. Check operation/difficulty/size/faction.', ephemeral: true }); return; }

  const user = await deps.userRepo.upsertByDiscordId({ discord_id: i.user.id, username: i.user.username, nickname: null, avatar: null, email: null, role: 'user' });
  const detail = await deps.raidService.create({ sub: user.id, role: user.role }, { ...parsed.data, notes: parsed.data.notes ?? null });
  deps.bus.raidCreated(detail);
  await i.reply({ content: `Raid created: **${detail.operation}** (${detail.codigo}). It will be posted in configured channels.`, ephemeral: true });
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && npx vitest run tests/discordCommands.test.ts && npm run typecheck`
Expected: PASS (4 testes); typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
git add backend/src/discord/commands.ts backend/tests/discordCommands.test.ts
git commit -m "feat(discord): handlers /create_raid e /set_raid_channel (testáveis, sem discord.js)"
```

---

### Task 9: Cliente do bot (discord.js) + wiring no server.ts

**Files:**
- Create: `backend/src/discord/bot.ts`
- Modify: `backend/src/app.ts` (garantir `broadcaster?` já existe do #4 — sem mudança)
- Modify: `backend/src/server.ts`

**Interfaces:**
- Consumes: `commands` (Task 8), `createDiscordJsGateway`/`noopGateway` (Task 7), `createDiscordSync` (Task 7), `createRaidEventBus` (Task 4), repos/services reais, `discord.js`.
- Produces: `attachBot(client, deps): void` — registra os slash commands, adapta a interação e roteia, e faz `client.login`. `deps = { token, clientId, raidService, userRepo, guildConfigRepo, bus }`.

> Verificado por **build** (discord.js não é unit-testável aqui) + **smoke manual** com bot token real.

- [ ] **Step 1: Implementar `backend/src/discord/bot.ts`**

```ts
import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits, Events, type ChatInputCommandInteraction } from 'discord.js';
import { OPERATIONS } from '../reference/operations';
import { handleCreateRaid, handleSetRaidChannel, type CommandDeps, type CommandInteraction } from './commands';
import { logger } from '../common/logger/logger';

export function buildCommandDefs() {
  const createRaid = new SlashCommandBuilder()
    .setName('create_raid')
    .setDescription('Create a raid (times are in UTC)')
    .addStringOption((o) => o.setName('operation').setDescription('Operation').setRequired(true).addChoices(...OPERATIONS.slice(0, 25).map((op) => ({ name: op, value: op }))))
    .addStringOption((o) => o.setName('difficulty').setDescription('Difficulty').setRequired(true).addChoices({ name: 'Story Mode', value: 'SM' }, { name: 'Veteran (HM)', value: 'HM' }, { name: 'Master (NiM)', value: 'NiM' }))
    .addIntegerOption((o) => o.setName('size').setDescription('Group size').setRequired(true).addChoices({ name: '8 players', value: 8 }, { name: '16 players', value: 16 }))
    .addStringOption((o) => o.setName('faction').setDescription('Faction').setRequired(true).addChoices({ name: 'Republic', value: 'Republic' }, { name: 'Empire', value: 'Empire' }))
    .addStringOption((o) => o.setName('date').setDescription('Date YYYY-MM-DD (UTC)').setRequired(true))
    .addStringOption((o) => o.setName('time').setDescription('Time HH:MM (UTC)').setRequired(true))
    .addIntegerOption((o) => o.setName('minimum_tier').setDescription('Minimum Tier 0-6').setMinValue(0).setMaxValue(6))
    .addBooleanOption((o) => o.setName('check_composition').setDescription('Enforce role slots'))
    .addStringOption((o) => o.setName('notes').setDescription('Notes'));

  const setChannel = new SlashCommandBuilder()
    .setName('set_raid_channel')
    .setDescription('Set this channel as the raid announcement channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

  return [createRaid.toJSON(), setChannel.toJSON()];
}

// Adapta a interação do discord.js para a superfície mínima dos handlers.
function adapt(interaction: ChatInputCommandInteraction): CommandInteraction {
  return {
    user: { id: interaction.user.id, username: interaction.user.username },
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    memberPermissions: {
      has: (perm) => Boolean(interaction.memberPermissions?.has(PermissionFlagsBits[perm as keyof typeof PermissionFlagsBits])),
    },
    getString: (n) => interaction.options.getString(n),
    getInteger: (n) => interaction.options.getInteger(n),
    getBoolean: (n) => interaction.options.getBoolean(n),
    reply: async (m) => { await interaction.reply({ content: m.content, ephemeral: m.ephemeral ?? false }); },
  };
}

export function attachBot(client: Client, deps: { token: string; clientId: string } & CommandDeps): void {
  // Registra os slash commands via REST (independe do gateway estar "ready").
  new REST({ version: '10' }).setToken(deps.token)
    .put(Routes.applicationCommands(deps.clientId), { body: buildCommandDefs() })
    .then(() => logger.info('Discord: slash commands registrados'))
    .catch((err) => logger.error({ err }, 'Discord: falha ao registrar commands'));

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const i = adapt(interaction);
    try {
      if (interaction.commandName === 'create_raid') await handleCreateRaid(i, deps);
      else if (interaction.commandName === 'set_raid_channel') await handleSetRaidChannel(i, deps);
    } catch (err) {
      logger.error({ err, cmd: interaction.commandName }, 'Discord: erro no comando');
      if (!interaction.replied) await interaction.reply({ content: 'Something went wrong.', ephemeral: true }).catch(() => {});
    }
  });

  client.login(deps.token).catch((err) => logger.error({ err }, 'Discord: falha no login (bot desativado)'));
}

export function createDiscordClient(): Client {
  return new Client({ intents: [GatewayIntentBits.Guilds] });
}
```

- [ ] **Step 2: Modificar `backend/src/server.ts`** — montar repos/gateway/sync/bus/bot

Adicionar imports:

```ts
import { createGuildConfigRepo } from './db/repositories/guildConfigRepo';
import { createRaidDiscordMessageRepo } from './db/repositories/raidDiscordMessageRepo';
import { createRaidEventBus } from './realtime/eventBus';
import { noopGateway, createDiscordJsGateway } from './discord/gateway';
import { createDiscordSync } from './discord/discordSync';
import { createDiscordClient, attachBot } from './discord/bot';
```

Trocar o trecho que hoje cria `broadcaster` e `app` por:

```ts
const socketBroadcaster = createRaidBroadcaster(io);
const guildConfigRepo = createGuildConfigRepo(db);
const raidDiscordMessageRepo = createRaidDiscordMessageRepo(db);

const discordClient = cfg.DISCORD_BOT_TOKEN ? createDiscordClient() : null;
const gateway = discordClient ? createDiscordJsGateway(discordClient) : noopGateway;
const discordSync = createDiscordSync({ gateway, guildConfigRepo, msgRepo: raidDiscordMessageRepo, appPublicUrl: cfg.APP_PUBLIC_URL });
const bus = createRaidEventBus(socketBroadcaster, discordSync);

const app = createApp({ authService, userService, characterService, progressionService, bossRepo, raidService, raidJoinService, broadcaster: bus });
httpServer.on('request', app);

if (discordClient && cfg.DISCORD_BOT_TOKEN) {
  attachBot(discordClient, { token: cfg.DISCORD_BOT_TOKEN, clientId: cfg.DISCORD_CLIENT_ID, raidService, userRepo, guildConfigRepo, bus });
}

httpServer.listen(cfg.PORT, () => logger.info(`HoloRaid backend (HTTP+Socket.IO${discordClient ? '+Discord' : ''}) ouvindo em :${cfg.PORT}`));
```

> **Nota:** `createRaidBroadcaster` já é importado (do #4). Remova a linha antiga `const broadcaster = createRaidBroadcaster(io);` e a antiga `createApp({...})`/`listen(...)` substituídas acima.

- [ ] **Step 3: Verificar build**

Run: `cd backend && npm run build`
Expected: exit 0.

- [ ] **Step 4: Suíte inteira**

Run: `cd backend && npm test`
Expected: todos verdes (inclui #1–#4 + os novos).

- [ ] **Step 5: (Smoke manual — precisa de bot token real) subir e testar**

1. Criar um bot no Discord Developer Portal (mesma Application do OAuth), copiar o **Bot Token** → `DISCORD_BOT_TOKEN` no `.env`.
2. Convidar o bot: `https://discord.com/oauth2/authorize?client_id=<DISCORD_CLIENT_ID>&scope=bot+applications.commands&permissions=18432` (Send Messages + Embed Links).
3. `npm run dev`; num servidor com o bot, rodar `/set_raid_channel` num canal; criar uma raid (web ou `/create_raid`) e ver o embed postar; entrar/sair e ver editar; encher e ver "Raid full".
Expected: posts/edições aparecem; horário no fuso local de cada um.

- [ ] **Step 6: Commit**

```bash
git add backend/src/discord/bot.ts backend/src/server.ts
git commit -m "feat(discord): cliente do bot + slash commands + wiring (event bus + sync)"
```

---

# FASE D — Flutter

### Task 10: URL configurável + banner "raid cheia"

**Files:**
- Modify: `app/lib/core/config/app_config.dart`
- Modify: `app/lib/features/raids/raid_detail_screen.dart`

**Interfaces:**
- Consumes: `AppConfig` (#1), `Raid` (#3).
- Produces: `AppConfig.appPublicUrl`; share usa ele; banner "Raid full" derivado do estado.

- [ ] **Step 1: Adicionar `appPublicUrl` em `app/lib/core/config/app_config.dart`**

```dart
  static const appPublicUrl = String.fromEnvironment('APP_PUBLIC_URL', defaultValue: 'https://holoraid.fun');
```

- [ ] **Step 2: Usar em `raid_detail_screen.dart`** — no `_share`, trocar a URL cravada:

```dart
    final url = '${AppConfig.appPublicUrl}/r/${raid.codigo}';
```

E garantir o import no topo:

```dart
import '../../core/config/app_config.dart';
```

- [ ] **Step 3: Adicionar banner "Raid full"** — no `data: (raid) { ... }`, calcular e exibir. Após a linha `final iAmLeader = ...;` adicionar:

```dart
          final confirmedByRole = (String role) => raid.roster.where((r) => r.status == 'confirmed' && r.role == role).length;
          final isFull = raid.checkComposition
              ? (confirmedByRole('Tank') >= raid.slotsTank && confirmedByRole('Healer') >= raid.slotsHeal && confirmedByRole('DPS') >= raid.slotsDps)
              : confirmed.length >= raid.size;
```

E, dentro do `children: [ ... ]` do `ListView`, logo após o bloco `Text('Início: ...')` (antes do `Wrap` de ações), inserir:

```dart
              if (isFull && raid.status == 'OPEN')
                Container(
                  margin: const EdgeInsets.symmetric(vertical: 8),
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(color: Theme.of(context).colorScheme.errorContainer, borderRadius: BorderRadius.circular(8)),
                  child: Row(children: [
                    const Icon(Icons.check_circle, size: 18),
                    const SizedBox(width: 8),
                    Text('Raid cheia — vai começar!', style: TextStyle(color: Theme.of(context).colorScheme.onErrorContainer)),
                  ]),
                ),
```

- [ ] **Step 4: Verificar**

Run: `cd app && flutter analyze && flutter test`
Expected: No issues found; testes passam.

- [ ] **Step 5: Build web**

Run: `cd app && flutter build web --dart-define=API_BASE_URL=http://localhost:3010 --dart-define=APP_PUBLIC_URL=https://holoraid.fun`
Expected: `√ Built build/web`.

- [ ] **Step 6: Commit**

```bash
git add app/lib/core/config/app_config.dart app/lib/features/raids/raid_detail_screen.dart
git commit -m "feat(app): APP_PUBLIC_URL configurável + banner de raid cheia"
```

---

## Verificação final (Definition of Done)

- [ ] `cd backend && npm test` — toda a suíte verde (config, eventBus, isRaidFull, raidFull.routes, embed, discordSync, discordCommands + #1–#4).
- [ ] `cd backend && npm run build && npm run typecheck` — exit 0.
- [ ] `npm run migrate` aplica `004_discord`.
- [ ] `cd app && flutter analyze && flutter test` — limpos; `flutter build web` compila.
- [ ] Smoke manual (Task 9, com bot token): `/set_raid_channel` → criar raid → embed posta/edita → "Raid full"; horário no fuso local.

---

## Self-review (cobertura do spec)

- Config bot token opcional + APP_PUBLIC_URL + fuso UTC: Task 1. ✓
- Modelo de dados (guild_config, raid_discord_messages): Task 2; repos+fakes: Task 3. ✓
- Event bus fan-out + isRaidFull: Task 4. ✓
- raidFull no controller (join que enche): Task 5. ✓
- Embed inglês + `<t:>`: Task 6. ✓
- DiscordGateway + DiscordSync best-effort (broadcast/edit/full/remove/isolamento de falha): Task 7. ✓
- Comandos /create_raid + /set_raid_channel (auto-criar conta, Manage Guild, validação): Task 8. ✓
- Cliente do bot + registro + wiring (bus com socket+discord; bot opcional): Task 9. ✓
- Flutter (URL configurável + banner cheia): Task 10. ✓
- Best-effort/bot opcional → #1–#4 verdes: Tasks 4, 7, 9. ✓
