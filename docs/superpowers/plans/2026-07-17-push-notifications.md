# Notificações push (#6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Notificar por push (Android + Web) o roster de uma raid em 3 eventos — vaga confirmada, raid cancelada e raid iniciando (30 min antes) — com liga/desliga global por usuário.

**Architecture:** Um `PushGateway` (abstração fina sobre o FCM, no-op sem credencial) + um `NotificationService` com 3 métodos explícitos, chamado **diretamente** nos pontos onde o evento de domínio é conhecido — **não** pelo `RaidEventBus`, que não tem onde carregar "quem foi promovido". O lembrete de "iniciando" vem de um `setInterval` de 60s com idempotência por coluna (`raids.starting_notified_at`).

**Tech Stack:** Node/TypeScript, Kysely + mysql2, Zod, Express, `firebase-admin` (backend); Flutter + `firebase_core`/`firebase_messaging` (app); vitest + supertest.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-17-push-notifications-design.md`.
- **Plataformas: Android + Web apenas.** Windows está **fora** (o `firebase_messaging` não suporta Flutter Windows). Não tente implementar push no Windows.
- **3 eventos apenas:** vaga confirmada, raid cancelada, raid iniciando. **Não** implemente "raid criada" nem "entrada/saída" — foram cortados de propósito (spam / duplicam o `@here` do #5d).
- **Nunca broadcast.** Notificação vai só para o roster da raid (confirmados **e** waitlist).
- **Textos das notificações em INGLÊS** (como o Discord). O app segue em português; i18n é ciclo próprio.
- **`FIREBASE_SERVICE_ACCOUNT` é o JSON da service account em BASE64** (uma linha), **opcional**: ausente → `noopPushGateway` + agendador não sobe. Zero regressão. É segredo — **nunca** commitar.
- **Push é best-effort:** falha do FCM é logada e **nunca** propaga (padrão do `DiscordSync`).
- **`notify` é dependência opcional** em controller/router/app/bot — assim #1–#5d seguem intactos.
- **Lead time do lembrete: 30 minutos**, como constante (`STARTING_SOON_MINUTES`).
- **Regressão:** os **166 testes** de #1–#5d seguem verdes.
- **Commits:** autor `Leonardo de Souza Guimarães <leozinhoszg@gmail.com>`. **NUNCA** `Co-Authored-By: Claude`.
- Backend roda em `backend/`. Testes: `npx vitest run <arquivo>`. Typecheck: `npm run typecheck`.

> ⚠️ **Task 8 (Flutter) está BLOQUEADA** até o dono rodar `flutterfire configure` (gera `app/lib/firebase_options.dart`). Sem esse arquivo o app **não compila**. Tasks 1–7 (backend) são independentes disso e entregam o subsistema completo em modo no-op.

---

### Task 1: Migration 006 + schema + DeviceTokenRepo

**Files:**
- Create: `backend/src/db/migrations/006_push.ts`
- Create: `backend/src/db/repositories/deviceTokenRepo.ts`
- Modify: `backend/src/db/schema.ts` (`UsuariosTable`, `RaidsTable`, nova `DeviceTokensTable`, `DB`)
- Modify: `backend/tests/fakes/fakeRepos.ts` (novo `makeFakeDeviceTokenRepo`)

**Interfaces:**
- Consumes: nada (primeira task).
- Produces:
  - `export type Platform = 'android' | 'web'`
  - `export type DeviceToken = { id: number; usuario_id: number; token: string; platform: Platform }`
  - `export interface DeviceTokenRepo { upsert(usuario_id: number, token: string, platform: Platform): Promise<void>; listByUsuarios(ids: number[]): Promise<DeviceToken[]>; deleteByTokens(tokens: string[]): Promise<void> }`
  - `createDeviceTokenRepo(db: Kysely<DB>): DeviceTokenRepo`
  - `makeFakeDeviceTokenRepo(): DeviceTokenRepo & { _rows: DeviceToken[] }`
  - Colunas: `usuarios.push_enabled` (tinyint, default 1), `raids.starting_notified_at` (datetime null).

> Repos neste projeto não têm teste unitário (são usados via fakes nos testes de service e verificados por smoke real). A verificação desta task é a migration aplicar + um smoke real de round-trip.

- [ ] **Step 1: Criar a migration**

Crie `backend/src/db/migrations/006_push.ts`:

```ts
import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('device_tokens')
    .addColumn('id', 'bigint', (c) => c.primaryKey().autoIncrement())
    .addColumn('usuario_id', 'bigint', (c) => c.notNull().references('usuarios.id').onDelete('cascade'))
    .addColumn('token', 'varchar(255)', (c) => c.notNull().unique())
    .addColumn('platform', sql`enum('android','web')`, (c) => c.notNull())
    .addColumn('created_at', 'datetime', (c) => c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn('updated_at', 'datetime', (c) => c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();
  await db.schema.createIndex('idx_dt_usuario').on('device_tokens').column('usuario_id').execute();

  await db.schema.alterTable('usuarios')
    .addColumn('push_enabled', 'boolean', (c) => c.notNull().defaultTo(true)).execute();
  await db.schema.alterTable('raids')
    .addColumn('starting_notified_at', 'datetime').execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('raids').dropColumn('starting_notified_at').execute();
  await db.schema.alterTable('usuarios').dropColumn('push_enabled').execute();
  await db.schema.dropTable('device_tokens').ifExists().execute();
}
```

- [ ] **Step 2: Tipar no schema Kysely**

Em `backend/src/db/schema.ts`:

**(a)** adicione `push_enabled` à `UsuariosTable` (logo abaixo de `role`):

```ts
  role: 'user' | 'admin';
  push_enabled: number; // MySQL boolean = tinyint (0/1)
```

**(b)** adicione `starting_notified_at` à `RaidsTable` (logo abaixo de `discord_message_id`):

```ts
  discord_message_id: string | null;
  starting_notified_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
```

**(c)** adicione a tabela nova (antes da interface `DB`):

```ts
export interface DeviceTokensTable {
  id: Generated<number>;
  usuario_id: number;
  token: string;
  platform: 'android' | 'web';
  created_at: Created;
  updated_at: Updated;
}
```

**(d)** registre em `DB`:

```ts
  raid_discord_messages: RaidDiscordMessagesTable;
  device_tokens: DeviceTokensTable;
}
```

- [ ] **Step 3: Criar o repo**

Crie `backend/src/db/repositories/deviceTokenRepo.ts`:

```ts
import type { Kysely } from 'kysely';
import type { DB } from '../schema';

export type Platform = 'android' | 'web';
export type DeviceToken = { id: number; usuario_id: number; token: string; platform: Platform };

export interface DeviceTokenRepo {
  upsert(usuario_id: number, token: string, platform: Platform): Promise<void>;
  listByUsuarios(ids: number[]): Promise<DeviceToken[]>;
  deleteByTokens(tokens: string[]): Promise<void>;
}

const COLS = ['id', 'usuario_id', 'token', 'platform'] as const;

export function createDeviceTokenRepo(db: Kysely<DB>): DeviceTokenRepo {
  return {
    // token é UNIQUE: o mesmo aparelho trocando de conta reatribui o usuario_id.
    async upsert(usuario_id, token, platform) {
      await db.insertInto('device_tokens')
        .values({ usuario_id, token, platform, updated_at: new Date() })
        .onDuplicateKeyUpdate({ usuario_id, platform, updated_at: new Date() })
        .execute();
    },
    async listByUsuarios(ids) {
      if (!ids.length) return [];
      const rows = await db.selectFrom('device_tokens').select(COLS).where('usuario_id', 'in', ids).execute();
      return rows as DeviceToken[];
    },
    async deleteByTokens(tokens) {
      if (!tokens.length) return;
      await db.deleteFrom('device_tokens').where('token', 'in', tokens).execute();
    },
  };
}
```

- [ ] **Step 4: Criar o fake**

Em `backend/tests/fakes/fakeRepos.ts`, adicione o import no topo:

```ts
import type { DeviceTokenRepo, DeviceToken } from '../../src/db/repositories/deviceTokenRepo';
```

e a factory ao final do arquivo:

```ts
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
```

- [ ] **Step 5: Aplicar a migration e rodar o smoke real**

Run: `cd backend && npm run migrate`
Expected: `OK: 006_push` no log, sem erro.

Smoke de round-trip real (cria usuário → upsert token → lista → upsert de novo (não duplica) → delete → cleanup):

```bash
cd backend && cat > smoke.tmp.ts <<'EOF'
import 'dotenv/config';
import { db } from './src/db/db';
import { createDeviceTokenRepo } from './src/db/repositories/deviceTokenRepo';
(async () => {
  const repo = createDeviceTokenRepo(db);
  const u = await db.insertInto('usuarios').values({ discord_id: 'smoke-6', username: 'smoke6', nickname: null, avatar: null, email: null, role: 'user', updated_at: new Date() }).executeTakeFirstOrThrow();
  const uid = Number(u.insertId);

  await repo.upsert(uid, 'tok-a', 'android');
  await repo.upsert(uid, 'tok-b', 'web');
  console.log('--> apos 2 upserts:', (await repo.listByUsuarios([uid])).length, '(esperado 2)');

  await repo.upsert(uid, 'tok-a', 'android'); // mesmo token -> nao duplica
  const list = await repo.listByUsuarios([uid]);
  console.log('--> apos upsert repetido:', list.length, '(esperado 2)');
  console.log('--> platforms:', JSON.stringify(list.map((t) => t.platform).sort()));

  await repo.deleteByTokens(['tok-a']);
  console.log('--> apos delete de tok-a:', (await repo.listByUsuarios([uid])).length, '(esperado 1)');

  const [pe] = await db.selectFrom('usuarios').select(['push_enabled']).where('id', '=', uid).execute();
  console.log('--> push_enabled default:', JSON.stringify(pe), '(esperado 1)');

  await db.deleteFrom('usuarios').where('id', '=', uid).execute(); // CASCADE limpa os tokens
  console.log('--> apos delete do usuario (CASCADE):', (await repo.listByUsuarios([uid])).length, '(esperado 0)');
  await db.destroy();
})().catch((e) => { console.log('FALHOU:', e.code || '', e.sqlMessage || e.message); process.exit(1); });
EOF
npx tsx smoke.tmp.ts; rm -f smoke.tmp.ts
```
Expected: `2`, `2`, `["android","web"]`, `1`, `{"push_enabled":1}`, `0`. O último prova que o `ON DELETE CASCADE` funciona.

- [ ] **Step 6: Typecheck e commit**

Run: `cd backend && npm run typecheck`
Expected: sem erros.

```bash
git add backend/src/db/migrations/006_push.ts backend/src/db/repositories/deviceTokenRepo.ts backend/src/db/schema.ts backend/tests/fakes/fakeRepos.ts
git commit -m "feat(push): migration 006 + device_tokens repo"
```

---

### Task 2: UserRepo ganha `push_enabled`, `findByIds` e `setPushEnabled`

**Files:**
- Modify: `backend/src/db/repositories/userRepo.ts`
- Modify: `backend/src/modules/users/users.service.ts`
- Modify: `backend/tests/fakes/fakeRepos.ts` (`makeFakeUserRepo`)
- Test: `backend/tests/users.routes.test.ts`

**Interfaces:**
- Consumes: coluna `usuarios.push_enabled` (Task 1).
- Produces:
  - `UserRecord` ganha `push_enabled: boolean` (sempre presente na leitura).
  - `UserRepo` ganha `findByIds(ids: number[]): Promise<UserRecord[]>` e `setPushEnabled(id: number, enabled: boolean): Promise<void>`.
  - `UserService` ganha `setPushEnabled(userId: number, enabled: boolean): Promise<void>`.
  - `GET /me` passa a expor `push_enabled`.

- [ ] **Step 1: Write the failing test**

Em `backend/tests/users.routes.test.ts`:

**(a)** o helper `build()` (linha 30) ainda não devolve o `userRepo` — os testes novos precisam dele. Ajuste o `return`:

```ts
  return { app: createApp({ authService, userService }), audits, u1, u2, userRepo };
```

**(b)** adicione ao final do arquivo:

```ts
describe('push_enabled (#6)', () => {
  it('GET /me expõe push_enabled (default true)', async () => {
    const { app, u1 } = await build();
    const token = signAccessToken({ sub: u1.id, role: 'user' });
    const res = await request(app).get('/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.push_enabled).toBe(true);
  });

  it('setPushEnabled desliga e findByIds reflete', async () => {
    const { userRepo, u1 } = await build();
    await userRepo.setPushEnabled(u1.id, false);
    const found = await userRepo.findByIds([u1.id]);
    expect(found).toHaveLength(1);
    expect(found[0]!.push_enabled).toBe(false);
  });

  it('findByIds retorna vazio p/ lista vazia', async () => {
    const { userRepo } = await build();
    expect(await userRepo.findByIds([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/users.routes.test.ts`
Expected: FAIL — `expected undefined to be true` (o campo não existe) e `userRepo.setPushEnabled is not a function`.

- [ ] **Step 3: Implementar no repo**

Em `backend/src/db/repositories/userRepo.ts`, substitua o tipo, a interface, `COLS` e as leituras:

```ts
export type Role = 'user' | 'admin';
export type UserRecord = {
  id: number; discord_id: string; username: string;
  nickname: string | null; avatar: string | null; email: string | null; role: Role;
  push_enabled: boolean;
};
export type UpsertUser = {
  discord_id: string; username: string;
  nickname: string | null; avatar: string | null; email: string | null; role: Role;
};

export interface UserRepo {
  upsertByDiscordId(p: UpsertUser): Promise<UserRecord>;
  findById(id: number): Promise<UserRecord | null>;
  findByIds(ids: number[]): Promise<UserRecord[]>;
  updateRole(id: number, role: Role): Promise<void>;
  setPushEnabled(id: number, enabled: boolean): Promise<void>;
  list(): Promise<UserRecord[]>;
}

const COLS = ['id', 'discord_id', 'username', 'nickname', 'avatar', 'email', 'role', 'push_enabled'] as const;

const norm = (row: any): UserRecord => ({ ...row, push_enabled: !!row.push_enabled });
```

e no `createUserRepo`, troque os `as UserRecord` por `norm(...)` e acrescente os 2 métodos:

```ts
    async upsertByDiscordId(p) {
      await db
        .insertInto('usuarios')
        .values({ ...p, updated_at: new Date() })
        .onDuplicateKeyUpdate({
          username: p.username, nickname: p.nickname, avatar: p.avatar,
          email: p.email, updated_at: new Date(),
        })
        .execute();
      const row = await db.selectFrom('usuarios').select(COLS)
        .where('discord_id', '=', p.discord_id).executeTakeFirstOrThrow();
      return norm(row);
    },
    async findById(id) {
      const row = await db.selectFrom('usuarios').select(COLS).where('id', '=', id).executeTakeFirst();
      return row ? norm(row) : null;
    },
    async findByIds(ids) {
      if (!ids.length) return [];
      const rows = await db.selectFrom('usuarios').select(COLS).where('id', 'in', ids).execute();
      return rows.map(norm);
    },
    async updateRole(id, role) {
      await db.updateTable('usuarios').set({ role, updated_at: new Date() }).where('id', '=', id).execute();
    },
    async setPushEnabled(id, enabled) {
      await db.updateTable('usuarios').set({ push_enabled: enabled ? 1 : 0, updated_at: new Date() }).where('id', '=', id).execute();
    },
    async list() {
      const rows = await db.selectFrom('usuarios').select(COLS).orderBy('id').execute();
      return rows.map(norm);
    },
```

- [ ] **Step 4: Implementar no fake e no service**

Em `backend/tests/fakes/fakeRepos.ts`, no `makeFakeUserRepo`, ajuste o `upsertByDiscordId` e adicione os 2 métodos:

```ts
    async upsertByDiscordId(p) {
      const existing = users.find((u) => u.discord_id === p.discord_id);
      if (existing) {
        Object.assign(existing, { username: p.username, nickname: p.nickname, avatar: p.avatar, email: p.email });
        return { ...existing };
      }
      const rec: UserRecord = { id: seq++, ...p, push_enabled: true };
      users.push(rec);
      return { ...rec };
    },
    async findById(id) { return users.find((u) => u.id === id) ?? null; },
    async findByIds(ids) { return users.filter((u) => ids.includes(u.id)).map((u) => ({ ...u })); },
    async updateRole(id, role) { const u = users.find((x) => x.id === id); if (u) u.role = role; },
    async setPushEnabled(id, enabled) { const u = users.find((x) => x.id === id); if (u) u.push_enabled = enabled; },
    async list() { return users.map((u) => ({ ...u })); },
```

Em `backend/src/modules/users/users.service.ts`, adicione o método ao objeto retornado (depois de `demote`):

```ts
    async setPushEnabled(userId: number, enabled: boolean): Promise<void> {
      await deps.userRepo.setPushEnabled(userId, enabled);
    },
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/users.routes.test.ts && npm run typecheck`
Expected: PASS e typecheck sem erros.

- [ ] **Step 6: Commit**

```bash
git add backend/src/db/repositories/userRepo.ts backend/src/modules/users/users.service.ts backend/tests/fakes/fakeRepos.ts backend/tests/users.routes.test.ts
git commit -m "feat(push): UserRepo com push_enabled, findByIds e setPushEnabled"
```

---

### Task 3: PushGateway + NotificationService

**Files:**
- Create: `backend/src/push/gateway.ts`
- Create: `backend/src/push/notification.service.ts`
- Create: `backend/tests/fakes/fakePush.ts`
- Test: `backend/tests/notification.test.ts`

**Interfaces:**
- Consumes: `DeviceTokenRepo` (Task 1), `UserRepo.findByIds` + `UserRecord.push_enabled` (Task 2), `RaidDetail` (#3).
- Produces:
  - `export type PushMessage = { title: string; body: string; data?: Record<string, string> }`
  - `export interface PushGateway { send(tokens: string[], msg: PushMessage): Promise<{ invalidTokens: string[] }> }`
  - `export const noopPushGateway: PushGateway`
  - `createNotificationService(deps: { gateway: PushGateway; deviceTokenRepo: DeviceTokenRepo; userRepo: UserRepo }): NotificationService`
  - `NotificationService` = `{ slotConfirmed(userId: number, detail: RaidDetail): Promise<void>; raidCancelled(detail: RaidDetail): Promise<void>; raidStarting(detail: RaidDetail): Promise<void> }`
  - `makeFakePushGateway(opts?: { invalidTokens?: string[]; fail?: boolean }): PushGateway & { sends: PushSend[] }`

- [ ] **Step 1: Write the failing test**

Crie `backend/tests/notification.test.ts`:

```ts
import { createNotificationService } from '../src/push/notification.service';
import { makeFakeUserRepo, makeFakeDeviceTokenRepo } from './fakes/fakeRepos';
import { makeFakePushGateway } from './fakes/fakePush';

const detail = (roster: { usuario_id: number; status: string }[] = []) => ({
  id: 7, codigo: 'X7', operation: 'Dread Palace', difficulty: 'HM', size: 8, faction: 'Republic',
  minimum_tier: 0, check_composition: false, disable_mentions: false, slots_tank: 2, slots_heal: 2, slots_dps: 4,
  notes: null, start_at: new Date('2026-08-01T20:30:00Z'), status: 'OPEN', created_by: 1,
  roster: roster.map((r) => ({ ...r, role: 'DPS' })),
} as any);

async function setup(gwOpts: { invalidTokens?: string[]; fail?: boolean } = {}) {
  const userRepo = makeFakeUserRepo();
  const deviceTokenRepo = makeFakeDeviceTokenRepo();
  const gateway = makeFakePushGateway(gwOpts);
  const mk = async (discord_id: string) =>
    userRepo.upsertByDiscordId({ discord_id, username: discord_id, nickname: null, avatar: null, email: null, role: 'user' });
  const notify = createNotificationService({ gateway, deviceTokenRepo, userRepo });
  return { notify, gateway, userRepo, deviceTokenRepo, mk };
}

describe('NotificationService', () => {
  it('slotConfirmed envia só para os tokens do promovido', async () => {
    const { notify, gateway, deviceTokenRepo, mk } = await setup();
    const a = await mk('a'); const b = await mk('b');
    await deviceTokenRepo.upsert(a.id, 'tok-a', 'android');
    await deviceTokenRepo.upsert(b.id, 'tok-b', 'android');

    await notify.slotConfirmed(a.id, detail([{ usuario_id: a.id, status: 'confirmed' }, { usuario_id: b.id, status: 'waitlist' }]));

    expect(gateway.sends).toHaveLength(1);
    expect(gateway.sends[0]!.tokens).toEqual(['tok-a']);
    expect(gateway.sends[0]!.msg.title).toBe("You're in!");
  });

  it('push_enabled=false não recebe nada', async () => {
    const { notify, gateway, userRepo, deviceTokenRepo, mk } = await setup();
    const a = await mk('a');
    await deviceTokenRepo.upsert(a.id, 'tok-a', 'android');
    await userRepo.setPushEnabled(a.id, false);

    await notify.slotConfirmed(a.id, detail([{ usuario_id: a.id, status: 'confirmed' }]));
    expect(gateway.sends).toHaveLength(0);
  });

  it('usuário sem token → nenhum envio, sem erro', async () => {
    const { notify, gateway, mk } = await setup();
    const a = await mk('a');
    await notify.slotConfirmed(a.id, detail([{ usuario_id: a.id, status: 'confirmed' }]));
    expect(gateway.sends).toHaveLength(0);
  });

  it('raidCancelled envia para todo o roster (confirmados + waitlist), sem duplicar tokens', async () => {
    const { notify, gateway, deviceTokenRepo, mk } = await setup();
    const a = await mk('a'); const b = await mk('b');
    await deviceTokenRepo.upsert(a.id, 'tok-a', 'android');
    await deviceTokenRepo.upsert(b.id, 'tok-b', 'web');

    await notify.raidCancelled(detail([{ usuario_id: a.id, status: 'confirmed' }, { usuario_id: b.id, status: 'waitlist' }]));

    expect(gateway.sends).toHaveLength(1);
    expect(gateway.sends[0]!.tokens.sort()).toEqual(['tok-a', 'tok-b']);
    expect(gateway.sends[0]!.msg.title).toBe('Raid cancelled');
  });

  it('tokens inválidos retornados pelo gateway são apagados', async () => {
    const { notify, deviceTokenRepo, mk } = await setup({ invalidTokens: ['tok-a'] });
    const a = await mk('a');
    await deviceTokenRepo.upsert(a.id, 'tok-a', 'android');
    await deviceTokenRepo.upsert(a.id, 'tok-ok', 'web');

    await notify.raidStarting(detail([{ usuario_id: a.id, status: 'confirmed' }]));

    const restantes = (await deviceTokenRepo.listByUsuarios([a.id])).map((t) => t.token);
    expect(restantes).toEqual(['tok-ok']);
  });

  it('gateway lançando não propaga (best-effort)', async () => {
    const { notify, deviceTokenRepo, mk } = await setup({ fail: true });
    const a = await mk('a');
    await deviceTokenRepo.upsert(a.id, 'tok-a', 'android');
    await expect(notify.raidStarting(detail([{ usuario_id: a.id, status: 'confirmed' }]))).resolves.toBeUndefined();
  });

  it('raidStarting menciona 30 minutos', async () => {
    const { notify, gateway, deviceTokenRepo, mk } = await setup();
    const a = await mk('a');
    await deviceTokenRepo.upsert(a.id, 'tok-a', 'android');
    await notify.raidStarting(detail([{ usuario_id: a.id, status: 'confirmed' }]));
    expect(gateway.sends[0]!.msg.body).toContain('30 minutes');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/notification.test.ts`
Expected: FAIL — não resolve `../src/push/notification.service`.

- [ ] **Step 3: Criar o gateway (contrato + noop)**

Crie `backend/src/push/gateway.ts`:

```ts
export type PushMessage = { title: string; body: string; data?: Record<string, string> };

export interface PushGateway {
  send(tokens: string[], msg: PushMessage): Promise<{ invalidTokens: string[] }>;
}

export const noopPushGateway: PushGateway = {
  async send() { return { invalidTokens: [] }; },
};
```

- [ ] **Step 4: Criar o fake do gateway**

Crie `backend/tests/fakes/fakePush.ts`:

```ts
import type { PushGateway, PushMessage } from '../../src/push/gateway';

export type PushSend = { tokens: string[]; msg: PushMessage };

export function makeFakePushGateway(opts: { invalidTokens?: string[]; fail?: boolean } = {}): PushGateway & { sends: PushSend[] } {
  const sends: PushSend[] = [];
  return {
    sends,
    async send(tokens, msg) {
      if (opts.fail) throw new Error('push boom');
      sends.push({ tokens, msg });
      return { invalidTokens: (opts.invalidTokens ?? []).filter((t) => tokens.includes(t)) };
    },
  };
}
```

- [ ] **Step 5: Criar o NotificationService**

Crie `backend/src/push/notification.service.ts`:

```ts
import type { PushGateway, PushMessage } from './gateway';
import type { DeviceTokenRepo } from '../db/repositories/deviceTokenRepo';
import type { UserRepo } from '../db/repositories/userRepo';
import type { RaidDetail } from '../modules/raids/raids.service';
import { logger } from '../common/logger/logger';

type Deps = { gateway: PushGateway; deviceTokenRepo: DeviceTokenRepo; userRepo: UserRepo };

const DIFF: Record<string, string> = { SM: 'Story Mode', HM: 'Veteran', NiM: 'Master' };
const label = (d: RaidDetail) => `${d.operation} (${DIFF[d.difficulty] ?? d.difficulty})`;
const dataOf = (d: RaidDetail, event: string) => ({ raidId: String(d.id), codigo: d.codigo, event });

export function createNotificationService(deps: Deps) {
  // Resolve destinatários → filtra push_enabled → tokens → envia → limpa inválidos.
  async function sendTo(userIds: number[], msg: PushMessage): Promise<void> {
    if (!userIds.length) return;
    const users = await deps.userRepo.findByIds(userIds);
    const enabled = users.filter((u) => u.push_enabled).map((u) => u.id);
    if (!enabled.length) return;
    const tokens = (await deps.deviceTokenRepo.listByUsuarios(enabled)).map((t) => t.token);
    if (!tokens.length) return;
    const { invalidTokens } = await deps.gateway.send(tokens, msg);
    if (invalidTokens.length) await deps.deviceTokenRepo.deleteByTokens(invalidTokens);
  }

  const rosterIds = (d: RaidDetail) => [...new Set(d.roster.map((r) => r.usuario_id))];
  // Best-effort: push nunca derruba o fluxo que o chamou.
  const guard = (p: Promise<void>) => p.catch((err) => { logger.error({ err }, 'push: envio falhou'); });

  return {
    async slotConfirmed(userId: number, detail: RaidDetail): Promise<void> {
      await guard(sendTo([userId], {
        title: "You're in!",
        body: `A spot opened up — you're confirmed for ${label(detail)}.`,
        data: dataOf(detail, 'slotConfirmed'),
      }));
    },
    async raidCancelled(detail: RaidDetail): Promise<void> {
      await guard(sendTo(rosterIds(detail), {
        title: 'Raid cancelled',
        body: `${label(detail)} was cancelled.`,
        data: dataOf(detail, 'raidCancelled'),
      }));
    },
    async raidStarting(detail: RaidDetail): Promise<void> {
      await guard(sendTo(rosterIds(detail), {
        title: 'Raid starting soon',
        body: `${label(detail)} starts in 30 minutes.`,
        data: dataOf(detail, 'raidStarting'),
      }));
    },
  };
}

export type NotificationService = ReturnType<typeof createNotificationService>;
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/notification.test.ts && npm run typecheck`
Expected: 7 testes PASS e typecheck sem erros.

- [ ] **Step 7: Commit**

```bash
git add backend/src/push/gateway.ts backend/src/push/notification.service.ts backend/tests/fakes/fakePush.ts backend/tests/notification.test.ts
git commit -m "feat(push): PushGateway + NotificationService (3 eventos)"
```

---

### Task 4: `leave` retorna o promovido + wiring dos 3 pontos

**Files:**
- Modify: `backend/src/modules/raids/raidJoin.service.ts:43-59` (`leave`)
- Modify: `backend/src/modules/raids/raids.controller.ts:12, 45-51, 61-66` (dep `notify`, `transition`, `leave`)
- Modify: `backend/src/modules/raids/raids.router.ts` (repassa `notify`)
- Modify: `backend/src/app.ts` (dep `notificationService?`)
- Modify: `backend/src/discord/components.ts` (`ComponentDeps.notify?`, `handleLeaveClick`)
- Test: `backend/tests/raidJoin.test.ts`, `backend/tests/push.routes.test.ts` (novo)

**Interfaces:**
- Consumes: `NotificationService` (Task 3).
- Produces:
  - `raidJoin.leave(actorId: number, raidId: number): Promise<{ promoted?: number }>` — `promoted` é o `usuario_id` promovido da waitlist (antes: `Promise<void>`).
  - `createRaidsController(raidService, raidJoinService, broadcaster?, notify?: NotificationService)`
  - `createRaidsRouter(raidService, raidJoinService, broadcaster?, notify?: NotificationService)`
  - `createApp({ ..., notificationService?: NotificationService })`
  - `ComponentDeps` ganha `notify?: NotificationService`.

- [ ] **Step 1: Write the failing test**

**(a)** Em `backend/tests/raidJoin.test.ts`, adicione ao final (usa o `setup(opts)` e o `mkChar` que já existem no arquivo; com `size: 1` e `check: false` a regra é headcount, então o 2º entra na waitlist):

```ts
describe('leave retorna o promovido (#6)', () => {
  it('promove o primeiro da waitlist e retorna o usuario_id', async () => {
    const { svc, raid, mkChar } = await setup({ size: 1 });
    const c1 = await mkChar(10, 'DPS');
    const c2 = await mkChar(20, 'DPS');
    expect((await svc.join(10, raid.id, c1.id)).status).toBe('confirmed');
    expect((await svc.join(20, raid.id, c2.id)).status).toBe('waitlist');

    const res = await svc.leave(10, raid.id);
    expect(res.promoted).toBe(20);
  });

  it('sem ninguém na waitlist → promoted undefined', async () => {
    const { svc, raid, mkChar } = await setup({ size: 1 });
    const c1 = await mkChar(10, 'DPS');
    await svc.join(10, raid.id, c1.id);
    expect((await svc.leave(10, raid.id)).promoted).toBeUndefined();
  });
});
```

**(b)** Crie `backend/tests/push.routes.test.ts` — prova o wiring do controller:

```ts
import request from 'supertest';
import { createApp } from '../src/app';
import { makeFakeUserRepo, makeFakeRaidRepo, makeFakeRaidPlayerRepo, makeFakePersonagemRepo, makeFakeDeviceTokenRepo } from './fakes/fakeRepos';
import { makeFakePushGateway } from './fakes/fakePush';
import { createNotificationService } from '../src/push/notification.service';
import { createRaidService } from '../src/modules/raids/raids.service';
import { createRaidJoinService } from '../src/modules/raids/raidJoin.service';
import { signAccessToken } from '../src/common/security/jwt';

beforeAll(() => { process.env.JWT_SECRET = 'z'.repeat(40); process.env.DISCORD_CLIENT_ID = 'C'; process.env.DISCORD_CLIENT_SECRET = 'S'; process.env.DISCORD_REDIRECT_URI = 'http://localhost/cb'; });

async function setup() {
  const userRepo = makeFakeUserRepo();
  const personagemRepo = makeFakePersonagemRepo();
  const raidRepo = makeFakeRaidRepo();
  const raidPlayerRepo = makeFakeRaidPlayerRepo(personagemRepo);
  const deviceTokenRepo = makeFakeDeviceTokenRepo();
  const gateway = makeFakePushGateway();
  const raidService = createRaidService({ raidRepo, raidPlayerRepo });
  const raidJoinService = createRaidJoinService({ raidRepo, raidPlayerRepo, personagemRepo });
  const notify = createNotificationService({ gateway, deviceTokenRepo, userRepo });
  const app = createApp({ authService: {} as any, raidService, raidJoinService, notificationService: notify });
  return { app, gateway, userRepo, deviceTokenRepo, personagemRepo, raidService, raidJoinService };
}
const tok = (id: number) => signAccessToken({ sub: id, role: 'user' });

describe('push no ciclo de raid (#6)', () => {
  it('cancelar a raid notifica o roster', async () => {
    const { app, gateway, userRepo, deviceTokenRepo, personagemRepo, raidService, raidJoinService } = await setup();
    const leader = await userRepo.upsertByDiscordId({ discord_id: 'l', username: 'l', nickname: null, avatar: null, email: null, role: 'user' });
    const p = await personagemRepo.create({ usuario_id: leader.id, nome: 'C', faccao: 'Republic', classe: 'Guardian', especializacao: 'Vigilance', role: 'DPS', origin_story: null, item_level: 330 } as any);
    await deviceTokenRepo.upsert(leader.id, 'tok-l', 'android');

    const raid = await raidService.create({ sub: leader.id, role: 'user' }, { operation: 'Dread Palace', difficulty: 'HM', size: 8, faction: 'Republic', minimum_tier: 0, check_composition: false, slots_tank: 2, slots_heal: 2, slots_dps: 4, notes: null, start_at: new Date('2026-08-01T20:30:00Z') } as any);
    await raidJoinService.join(leader.id, raid.id, p.id);

    const res = await request(app).post(`/raids/${raid.id}/cancel`).set('Authorization', `Bearer ${tok(leader.id)}`);
    expect(res.status).toBe(200);
    expect(gateway.sends).toHaveLength(1);
    expect(gateway.sends[0]!.msg.title).toBe('Raid cancelled');
    expect(gateway.sends[0]!.tokens).toEqual(['tok-l']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/raidJoin.test.ts tests/push.routes.test.ts`
Expected: FAIL — `expected undefined to be 20` (leave retorna void) e `gateway.sends` vazio (controller não notifica).

- [ ] **Step 3: `leave` retorna o promovido**

Em `backend/src/modules/raids/raidJoin.service.ts`, substitua o `leave`:

```ts
    async leave(actorId: number, raidId: number): Promise<{ promoted?: number }> {
      const raid = await deps.raidRepo.findById(raidId);
      if (!raid) throw new NotFoundError('Raid não encontrada');
      if (raid.status !== 'OPEN') throw new ConflictError('Só é possível sair de uma raid aberta');
      const me = await deps.raidPlayerRepo.findByRaidAndUser(raidId, actorId);
      if (!me) throw new NotFoundError('Você não está nesta raid');

      const wasConfirmed = me.status === 'confirmed';
      const freedRole = me.role;
      await deps.raidPlayerRepo.deleteByRaidAndUser(raidId, actorId);

      if (wasConfirmed) {
        const waitlist = (await deps.raidPlayerRepo.listByRaid(raidId)).filter((p) => p.status === 'waitlist'); // já ordenado por joined_at
        const candidate = raid.check_composition ? waitlist.find((p) => p.role === freedRole) : waitlist[0];
        if (candidate) {
          await deps.raidPlayerRepo.updateStatus(candidate.id, 'confirmed');
          return { promoted: candidate.usuario_id };
        }
      }
      return {};
    },
```

- [ ] **Step 4: Wiring no controller, router e app**

Em `backend/src/modules/raids/raids.controller.ts`:

**(a)** import e assinatura:

```ts
import type { NotificationService } from '../../push/notification.service';
```
```ts
export function createRaidsController(raidService: RaidService, raidJoinService: RaidJoinService, broadcaster: RaidBroadcaster = noopBroadcaster, notify?: NotificationService) {
```

**(b)** `transition` notifica no cancel:

```ts
    transition(action: 'start' | 'finish' | 'cancel') {
      return async (req: Request, res: Response) => {
        const detail = await raidService.transition(actorOf(req), Number(req.params.id), action);
        broadcaster.raidUpdated(detail, EVENT[action]);
        if (action === 'cancel') await notify?.raidCancelled(detail);
        res.json(detail);
      };
    },
```

**(c)** `leave` notifica o promovido:

```ts
    async leave(req: Request, res: Response) {
      const id = Number(req.params.id);
      const { promoted } = await raidJoinService.leave(req.user!.sub, id);
      const detail = await raidService.getDetail(id);
      broadcaster.raidUpdated(detail, 'playerLeft');
      if (promoted) await notify?.slotConfirmed(promoted, detail);
      res.status(204).send();
    },
```

Em `backend/src/modules/raids/raids.router.ts`, propague o novo parâmetro: a factory passa a ser
`createRaidsRouter(raidService, raidJoinService, broadcaster?, notify?)` e repassa `notify` ao
`createRaidsController(raidService, raidJoinService, broadcaster, notify)`.

Em `backend/src/app.ts`:

```ts
import type { NotificationService } from './push/notification.service';
```
adicione `notificationService?: NotificationService;` ao objeto `deps` e passe adiante:

```ts
  if (deps.raidService && deps.raidJoinService) {
    app.use('/', createRaidsRouter(deps.raidService, deps.raidJoinService, deps.broadcaster, deps.notificationService));
  }
```

- [ ] **Step 5: Wiring no handler do Discord**

Em `backend/src/discord/components.ts`:

**(a)** import + `ComponentDeps` ganha o campo opcional:

```ts
import type { NotificationService } from '../push/notification.service';
```
```ts
  notify?: NotificationService;
```

**(b)** `handleLeaveClick` repassa o promovido:

```ts
export async function handleLeaveClick(i: ComponentInteraction, deps: ComponentDeps): Promise<void> {
  const code = codeFromCustomId(i.customId);
  let detail: RaidDetail;
  try { detail = await deps.raidService.getByCodigo(code); }
  catch { await i.reply({ content: 'Raid not found.', ephemeral: true }); return; }

  const user = await actorFor(i, deps);
  try {
    const { promoted } = await deps.raidJoinService.leave(user.id, detail.id);
    const fresh = await deps.raidService.getDetail(detail.id);
    deps.bus.raidUpdated(fresh, 'playerLeft');
    if (promoted) await deps.notify?.slotConfirmed(promoted, fresh);
    await i.reply({ content: 'You left the raid.', ephemeral: true });
  } catch (err) {
    await i.reply({ content: leaveErrorMessage(err), ephemeral: true });
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/raidJoin.test.ts tests/push.routes.test.ts && npm run typecheck`
Expected: PASS e typecheck sem erros.

- [ ] **Step 7: Regressão desta fatia**

Run: `cd backend && npm test`
Expected: **todos** passam. `notify` é opcional, então #1–#5d seguem intactos. Se algo quebrar, **pare e corrija**.

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/raids/raidJoin.service.ts backend/src/modules/raids/raids.controller.ts backend/src/modules/raids/raids.router.ts backend/src/app.ts backend/src/discord/components.ts backend/tests/raidJoin.test.ts backend/tests/push.routes.test.ts
git commit -m "feat(push): leave retorna promovido + notifica slotConfirmed/raidCancelled"
```

---

### Task 5: Endpoints `POST /devices` e `PUT /me/push`

**Files:**
- Create: `backend/src/modules/devices/devices.router.ts`
- Create: `backend/src/modules/devices/devices.controller.ts`
- Modify: `backend/src/modules/users/users.router.ts` (rota `PUT /me/push`)
- Modify: `backend/src/modules/users/users.controller.ts` (handler `setPush`)
- Modify: `backend/src/app.ts` (monta o devices router)
- Test: `backend/tests/devices.routes.test.ts` (novo)

**Interfaces:**
- Consumes: `DeviceTokenRepo` (Task 1), `UserService.setPushEnabled` (Task 2).
- Produces:
  - `createDevicesRouter(deviceTokenRepo: DeviceTokenRepo): Router` → `POST /devices`.
  - `createApp({ ..., deviceTokenRepo?: DeviceTokenRepo })`.
  - `PUT /me/push` no users router.

- [ ] **Step 1: Write the failing test**

Crie `backend/tests/devices.routes.test.ts`:

```ts
import request from 'supertest';
import { createApp } from '../src/app';
import { makeFakeUserRepo, makeFakeDeviceTokenRepo } from './fakes/fakeRepos';
import { createUserService } from '../src/modules/users/users.service';
import { signAccessToken } from '../src/common/security/jwt';

beforeAll(() => { process.env.JWT_SECRET = 'z'.repeat(40); process.env.DISCORD_CLIENT_ID = 'C'; process.env.DISCORD_CLIENT_SECRET = 'S'; process.env.DISCORD_REDIRECT_URI = 'http://localhost/cb'; });

async function setup() {
  const userRepo = makeFakeUserRepo();
  const deviceTokenRepo = makeFakeDeviceTokenRepo();
  const userService = createUserService({ userRepo, auditLog: async () => {} });
  const app = createApp({ authService: {} as any, userService, deviceTokenRepo });
  const u = await userRepo.upsertByDiscordId({ discord_id: 'd1', username: 'u1', nickname: null, avatar: null, email: null, role: 'user' });
  return { app, deviceTokenRepo, userRepo, u };
}
const tok = (id: number) => signAccessToken({ sub: id, role: 'user' });

describe('POST /devices', () => {
  it('sem JWT → 401', async () => {
    const { app } = await setup();
    const res = await request(app).post('/devices').send({ token: 't1', platform: 'android' });
    expect(res.status).toBe(401);
  });

  it('com JWT → 204 e grava com o usuario do token', async () => {
    const { app, deviceTokenRepo, u } = await setup();
    const res = await request(app).post('/devices').set('Authorization', `Bearer ${tok(u.id)}`).send({ token: 't1', platform: 'android' });
    expect(res.status).toBe(204);
    const rows = await deviceTokenRepo.listByUsuarios([u.id]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.token).toBe('t1');
    expect(rows[0]!.platform).toBe('android');
  });

  it('mesmo token 2x → não duplica', async () => {
    const { app, deviceTokenRepo, u } = await setup();
    const h = { Authorization: `Bearer ${tok(u.id)}` };
    await request(app).post('/devices').set(h).send({ token: 't1', platform: 'android' });
    await request(app).post('/devices').set(h).send({ token: 't1', platform: 'android' });
    expect(await deviceTokenRepo.listByUsuarios([u.id])).toHaveLength(1);
  });

  it('platform inválida → 422', async () => {
    const { app, u } = await setup();
    const res = await request(app).post('/devices').set('Authorization', `Bearer ${tok(u.id)}`).send({ token: 't1', platform: 'ios' });
    expect(res.status).toBe(422);
  });
});

describe('PUT /me/push', () => {
  it('grava push_enabled e GET /me reflete', async () => {
    const { app, u } = await setup();
    const h = { Authorization: `Bearer ${tok(u.id)}` };
    const res = await request(app).put('/me/push').set(h).send({ enabled: false });
    expect(res.status).toBe(204);
    const me = await request(app).get('/me').set(h);
    expect(me.body.push_enabled).toBe(false);
  });

  it('sem JWT → 401', async () => {
    const { app } = await setup();
    expect((await request(app).put('/me/push').send({ enabled: false })).status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/devices.routes.test.ts`
Expected: FAIL — `404` no `POST /devices` (rota não existe).

- [ ] **Step 3: Criar o controller de devices**

Crie `backend/src/modules/devices/devices.controller.ts`:

```ts
import type { Request, Response } from 'express';
import type { DeviceTokenRepo, Platform } from '../../db/repositories/deviceTokenRepo';

export function createDevicesController(deviceTokenRepo: DeviceTokenRepo) {
  return {
    // O usuario vem SEMPRE do JWT — o cliente não escolhe de quem é o token.
    async register(req: Request, res: Response) {
      const { token, platform } = req.body as { token: string; platform: Platform };
      await deviceTokenRepo.upsert(req.user!.sub, token, platform);
      res.status(204).send();
    },
  };
}
```

- [ ] **Step 4: Criar o router de devices**

Crie `backend/src/modules/devices/devices.router.ts`:

```ts
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../common/security/guards';
import { validate } from '../../common/middleware/validate';
import { createDevicesController } from './devices.controller';
import type { DeviceTokenRepo } from '../../db/repositories/deviceTokenRepo';

const wrap = (fn: (req: any, res: any) => Promise<unknown> | unknown) =>
  (req: any, res: any, next: any) => Promise.resolve(fn(req, res)).catch(next);

const registerBody = z.object({
  token: z.string().min(1).max(255),
  platform: z.enum(['android', 'web']),
});

export function createDevicesRouter(deviceTokenRepo: DeviceTokenRepo): Router {
  const c = createDevicesController(deviceTokenRepo);
  const r = Router();
  r.post('/devices', requireAuth, validate({ body: registerBody }), wrap(c.register));
  return r;
}
```

- [ ] **Step 5: `PUT /me/push` no módulo de users**

Em `backend/src/modules/users/users.controller.ts`, adicione ao objeto retornado:

```ts
    async setPush(req: Request, res: Response) {
      const { enabled } = req.body as { enabled: boolean };
      await userService.setPushEnabled(req.user!.sub, enabled);
      res.status(204).send();
    },
```

Em `backend/src/modules/users/users.router.ts`, adicione o schema e a rota:

```ts
const pushBody = z.object({ enabled: z.boolean() });
```
```ts
  r.get('/me', requireAuth, wrap(c.me));
  r.put('/me/push', requireAuth, validate({ body: pushBody }), wrap(c.setPush));
```

- [ ] **Step 6: Montar no app**

Em `backend/src/app.ts`:

```ts
import { createDevicesRouter } from './modules/devices/devices.router';
import type { DeviceTokenRepo } from './db/repositories/deviceTokenRepo';
```
adicione `deviceTokenRepo?: DeviceTokenRepo;` ao `deps` e monte o router (depois do `usersRouter`):

```ts
  if (deps.userService) app.use('/', createUsersRouter(deps.userService));
  if (deps.deviceTokenRepo) app.use('/', createDevicesRouter(deps.deviceTokenRepo));
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/devices.routes.test.ts && npm run typecheck`
Expected: 6 testes PASS e typecheck sem erros.

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/devices backend/src/modules/users/users.router.ts backend/src/modules/users/users.controller.ts backend/src/app.ts backend/tests/devices.routes.test.ts
git commit -m "feat(push): endpoints POST /devices e PUT /me/push"
```

---

### Task 6: Agendador do lembrete "raid iniciando"

**Files:**
- Create: `backend/src/push/scheduler.ts`
- Modify: `backend/src/db/repositories/raidRepo.ts` (`listStartingSoon`, `markStartingNotified`)
- Modify: `backend/tests/fakes/fakeRepos.ts` (`makeFakeRaidRepo`)
- Test: `backend/tests/scheduler.test.ts` (novo)

**Interfaces:**
- Consumes: `NotificationService.raidStarting` (Task 3), `RaidService.getDetail` (#3).
- Produces:
  - `RaidRepo` ganha `listStartingSoon(withinMinutes: number): Promise<RaidRecord[]>` e `markStartingNotified(id: number): Promise<void>`.
  - `export const STARTING_SOON_MINUTES = 30`
  - `runStartingSoonTick(deps: { raidRepo; raidService; notify }): Promise<number>` — retorna quantas raids notificou.
  - `startScheduler(deps, intervalMs?): NodeJS.Timeout`

> `RaidRecord` **não** ganha `starting_notified_at` — é estado interno do agendador, filtrado no SQL. Isso mantém `RaidDetail` (e o app/Discord) intactos.

- [ ] **Step 1: Write the failing test**

Crie `backend/tests/scheduler.test.ts`:

```ts
import { runStartingSoonTick } from '../src/push/scheduler';
import { makeFakeRaidRepo, makeFakeRaidPlayerRepo, makeFakePersonagemRepo, makeFakeUserRepo, makeFakeDeviceTokenRepo } from './fakes/fakeRepos';
import { makeFakePushGateway } from './fakes/fakePush';
import { createNotificationService } from '../src/push/notification.service';
import { createRaidService } from '../src/modules/raids/raids.service';

const raidInput = (startAt: Date) => ({
  operation: 'Dread Palace', difficulty: 'HM' as const, size: 8, faction: 'Republic' as const,
  minimum_tier: 0, check_composition: false, slots_tank: 2, slots_heal: 2, slots_dps: 4,
  notes: null, start_at: startAt,
});

async function setup() {
  const raidRepo = makeFakeRaidRepo();
  const personagemRepo = makeFakePersonagemRepo();
  const raidPlayerRepo = makeFakeRaidPlayerRepo(personagemRepo);
  const userRepo = makeFakeUserRepo();
  const deviceTokenRepo = makeFakeDeviceTokenRepo();
  const gateway = makeFakePushGateway();
  const raidService = createRaidService({ raidRepo, raidPlayerRepo });
  const notify = createNotificationService({ gateway, deviceTokenRepo, userRepo });
  return { raidRepo, raidService, notify, gateway, deps: { raidRepo, raidService, notify } };
}

describe('runStartingSoonTick', () => {
  it('raid dentro da janela → notifica uma vez; 2º tick não re-envia', async () => {
    const { raidService, deps } = await setup();
    await raidService.create({ sub: 1, role: 'user' }, raidInput(new Date(Date.now() + 10 * 60_000)));

    expect(await runStartingSoonTick(deps)).toBe(1);
    expect(await runStartingSoonTick(deps)).toBe(0); // idempotente
  });

  it('raid fora da janela (2h) → ignorada', async () => {
    const { raidService, deps } = await setup();
    await raidService.create({ sub: 1, role: 'user' }, raidInput(new Date(Date.now() + 120 * 60_000)));
    expect(await runStartingSoonTick(deps)).toBe(0);
  });

  it('raid no passado → ignorada', async () => {
    const { raidService, deps } = await setup();
    await raidService.create({ sub: 1, role: 'user' }, raidInput(new Date(Date.now() - 5 * 60_000)));
    expect(await runStartingSoonTick(deps)).toBe(0);
  });

  it('raid não-OPEN → ignorada', async () => {
    const { raidService, deps } = await setup();
    const r = await raidService.create({ sub: 1, role: 'user' }, raidInput(new Date(Date.now() + 10 * 60_000)));
    await raidService.transition({ sub: 1, role: 'user' }, r.id, 'cancel');
    expect(await runStartingSoonTick(deps)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/scheduler.test.ts`
Expected: FAIL — não resolve `../src/push/scheduler`.

- [ ] **Step 3: Métodos novos no raidRepo**

Em `backend/src/db/repositories/raidRepo.ts`, adicione à interface:

```ts
  listStartingSoon(withinMinutes: number): Promise<RaidRecord[]>;
  markStartingNotified(id: number): Promise<void>;
```

e ao `createRaidRepo` (antes do `delete`):

```ts
    // OPEN, ainda não notificada, começando entre agora e agora+withinMinutes.
    async listStartingSoon(withinMinutes) {
      const now = new Date();
      const until = new Date(now.getTime() + withinMinutes * 60_000);
      const rows = await db.selectFrom('raids').select(COLS)
        .where('status', '=', 'OPEN')
        .where('starting_notified_at', 'is', null)
        .where('start_at', '>=', now)
        .where('start_at', '<=', until)
        .execute();
      return rows.map(norm);
    },
    async markStartingNotified(id) {
      await db.updateTable('raids').set({ starting_notified_at: new Date(), updated_at: new Date() }).where('id', '=', id).execute();
    },
```

- [ ] **Step 4: Fake do raidRepo**

Em `backend/tests/fakes/fakeRepos.ts`, no `makeFakeRaidRepo`, adicione o `Set` de controle e os 2 métodos:

```ts
export function makeFakeRaidRepo(): RaidRepo {
  const rows: RaidRecord[] = [];
  const notified = new Set<number>(); // espelha raids.starting_notified_at
  let seq = 1;
  return {
    async create(r: NewRaid) { const rec: RaidRecord = { id: seq++, status: 'OPEN', ...r, disable_mentions: r.disable_mentions ?? false }; rows.push(rec); return { ...rec }; },
    async findById(id) { return rows.find((x) => x.id === id) ?? null; },
    async findByCodigo(codigo) { return rows.find((x) => x.codigo === codigo) ?? null; },
    async list(f) {
      return rows.filter((x) => (!f.status || x.status === f.status) && (!f.faction || x.faction === f.faction) && (!f.operation || x.operation === f.operation)).map((x) => ({ ...x }));
    },
    async listStartingSoon(withinMinutes) {
      const now = Date.now();
      const until = now + withinMinutes * 60_000;
      return rows
        .filter((r) => r.status === 'OPEN' && !notified.has(r.id) && +r.start_at >= now && +r.start_at <= until)
        .map((r) => ({ ...r }));
    },
    async markStartingNotified(id) { notified.add(id); },
    async update(id, patch) { const x = rows.find((r) => r.id === id); if (x) Object.assign(x, patch); },
    async updateStatus(id, status) { const x = rows.find((r) => r.id === id); if (x) x.status = status; },
    async delete(id) { const i = rows.findIndex((r) => r.id === id); if (i >= 0) rows.splice(i, 1); },
  };
}
```

- [ ] **Step 5: Criar o agendador**

Crie `backend/src/push/scheduler.ts`:

```ts
import type { RaidRepo } from '../db/repositories/raidRepo';
import type { RaidService } from '../modules/raids/raids.service';
import type { NotificationService } from './notification.service';
import { logger } from '../common/logger/logger';

export const STARTING_SOON_MINUTES = 30;

type Deps = { raidRepo: RaidRepo; raidService: RaidService; notify: NotificationService };

// Notifica as raids que começam em <=30min e marca cada uma (idempotência:
// restart do processo ou tick duplicado não re-notificam).
export async function runStartingSoonTick(deps: Deps): Promise<number> {
  const raids = await deps.raidRepo.listStartingSoon(STARTING_SOON_MINUTES);
  let sent = 0;
  for (const r of raids) {
    try {
      const detail = await deps.raidService.getDetail(r.id);
      await deps.notify.raidStarting(detail);
      await deps.raidRepo.markStartingNotified(r.id);
      sent++;
    } catch (err) {
      logger.error({ err, raid: r.id }, 'push: lembrete falhou');
    }
  }
  return sent;
}

export function startScheduler(deps: Deps, intervalMs = 60_000): NodeJS.Timeout {
  const t = setInterval(() => {
    runStartingSoonTick(deps).catch((err) => logger.error({ err }, 'push: tick falhou'));
  }, intervalMs);
  t.unref(); // não segura o processo
  return t;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/scheduler.test.ts && npm run typecheck`
Expected: 4 testes PASS e typecheck sem erros.

- [ ] **Step 7: Commit**

```bash
git add backend/src/push/scheduler.ts backend/src/db/repositories/raidRepo.ts backend/tests/fakes/fakeRepos.ts backend/tests/scheduler.test.ts
git commit -m "feat(push): agendador do lembrete 'raid iniciando' (idempotente)"
```

---

### Task 7: Gateway real do FCM + config + wiring no server

**Files:**
- Create: `backend/src/push/fcmGateway.ts`
- Modify: `backend/src/config/index.ts` (`FIREBASE_SERVICE_ACCOUNT`)
- Modify: `backend/src/server.ts` (wiring)
- Modify: `backend/.env.example`
- Modify: `backend/package.json` (dep `firebase-admin`)
- Test: `backend/tests/config.test.ts`

**Interfaces:**
- Consumes: `PushGateway` (Task 3), `createNotificationService` (Task 3), `startScheduler` (Task 6), `createDeviceTokenRepo` (Task 1).
- Produces: `createFcmGateway(serviceAccountBase64: string): PushGateway`; `cfg.FIREBASE_SERVICE_ACCOUNT?: string`.

- [ ] **Step 1: Write the failing test**

Em `backend/tests/config.test.ts`, adicione ao final (o env-base do arquivo se chama `good`):

```ts
describe('FIREBASE_SERVICE_ACCOUNT (#6)', () => {
  it('é opcional — ausente carrega normalmente', () => {
    expect(loadConfig(good as any).FIREBASE_SERVICE_ACCOUNT).toBeUndefined();
  });
  it('quando presente, é lido como string', () => {
    const c = loadConfig({ ...good, FIREBASE_SERVICE_ACCOUNT: 'eyJhIjoxfQ==' } as any);
    expect(c.FIREBASE_SERVICE_ACCOUNT).toBe('eyJhIjoxfQ==');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/config.test.ts`
Expected: FAIL — `Property 'FIREBASE_SERVICE_ACCOUNT' does not exist` (typecheck) ou `undefined` no 2º teste.

- [ ] **Step 3: Config**

Em `backend/src/config/index.ts`, adicione ao `EnvSchema` (depois de `APP_PUBLIC_URL`):

```ts
  APP_PUBLIC_URL: z.string().url().default('https://holoraid.fun'),
  FIREBASE_SERVICE_ACCOUNT: z.string().min(1).optional(),
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/config.test.ts`
Expected: PASS.

- [ ] **Step 5: Instalar a dependência**

Run: `cd backend && npm install firebase-admin@^13`
Expected: instala sem erro; `package.json` ganha `"firebase-admin": "^13.x"` em `dependencies`.

Run: `cd backend && npm audit --omit=dev`
Expected: **0 vulnerabilidades em produção**. Se aparecer alguma, trate antes de seguir (segurança é prioridade declarada do projeto).

- [ ] **Step 6: Criar o gateway real**

Crie `backend/src/push/fcmGateway.ts`:

```ts
import { initializeApp, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import type { PushGateway } from './gateway';

// Códigos do FCM que significam "esse token morreu" → apagar do banco.
const INVALID = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

export function createFcmGateway(serviceAccountBase64: string): PushGateway {
  const json = JSON.parse(Buffer.from(serviceAccountBase64, 'base64').toString('utf8'));
  const app = initializeApp({ credential: cert(json) });
  const messaging = getMessaging(app);

  return {
    async send(tokens, msg) {
      if (!tokens.length) return { invalidTokens: [] };
      const res = await messaging.sendEachForMulticast({
        tokens,
        notification: { title: msg.title, body: msg.body },
        data: msg.data,
      });
      const invalidTokens: string[] = [];
      res.responses.forEach((r, i) => {
        if (!r.success && r.error && INVALID.has(r.error.code)) invalidTokens.push(tokens[i]!);
      });
      return { invalidTokens };
    },
  };
}
```

- [ ] **Step 7: Wiring no server**

Em `backend/src/server.ts`:

**(a)** imports (junto dos outros):

```ts
import { createDeviceTokenRepo } from './db/repositories/deviceTokenRepo';
import { noopPushGateway } from './push/gateway';
import { createFcmGateway } from './push/fcmGateway';
import { createNotificationService } from './push/notification.service';
import { startScheduler } from './push/scheduler';
```

**(b)** monte o push logo **antes** do `const app = createApp(...)`:

```ts
// Push opcional: sem FIREBASE_SERVICE_ACCOUNT, gateway no-op e agendador não sobe.
const deviceTokenRepo = createDeviceTokenRepo(db);
const pushGateway = cfg.FIREBASE_SERVICE_ACCOUNT ? createFcmGateway(cfg.FIREBASE_SERVICE_ACCOUNT) : noopPushGateway;
const notify = createNotificationService({ gateway: pushGateway, deviceTokenRepo, userRepo });
```

**(c)** passe ao `createApp`:

```ts
const app = createApp({ authService, userService, characterService, progressionService, bossRepo, raidService, raidJoinService, broadcaster: bus, notificationService: notify, deviceTokenRepo });
```

**(d)** passe ao `attachBot` (adicione `notify` ao objeto de deps existente):

```ts
  attachBot(discordClient, { token: cfg.DISCORD_BOT_TOKEN, clientId: cfg.DISCORD_CLIENT_ID, raidService, userRepo, guildConfigRepo, bus, report: discordSync.reportTo, personagemRepo, raidJoinService, appPublicUrl: cfg.APP_PUBLIC_URL, notify });
```

**(e)** suba o agendador e ajuste o log (depois do `attachBot`):

```ts
if (cfg.FIREBASE_SERVICE_ACCOUNT) {
  startScheduler({ raidRepo, raidService, notify });
  logger.info('Push: agendador de lembretes ativo');
}

httpServer.listen(cfg.PORT, () => logger.info(`HoloRaid backend (HTTP+Socket.IO${discordClient ? '+Discord' : ''}${cfg.FIREBASE_SERVICE_ACCOUNT ? '+Push' : ''}) ouvindo em :${cfg.PORT}`));
```

- [ ] **Step 8: Documentar no `.env.example`**

Em `backend/.env.example`, adicione ao final:

```
# Push (opcional): JSON da service account do Firebase em BASE64, numa linha só.
# Ausente => push desligado (no-op) e agendador não sobe.
# Gerar: base64 -w0 service-account.json
FIREBASE_SERVICE_ACCOUNT=
```

- [ ] **Step 9: Verificar o modo no-op**

Run: `cd backend && npm run typecheck && npm run build`
Expected: ambos sem erros.

Run: `cd backend && npm test`
Expected: **todos passam** — sem `FIREBASE_SERVICE_ACCOUNT` no `.env`, nada de push sobe.

Suba o servidor e confirme que ele não anuncia Push:

Run: `cd backend && npm run dev`
Expected: log `HoloRaid backend (HTTP+Socket.IO) ouvindo em :3000` — **sem** `+Push` e **sem** "agendador de lembretes ativo", já que `FIREBASE_SERVICE_ACCOUNT` está vazio. Encerre com Ctrl+C.

- [ ] **Step 10: Commit**

```bash
git add backend/src/push/fcmGateway.ts backend/src/config/index.ts backend/src/server.ts backend/.env.example backend/package.json backend/package-lock.json backend/tests/config.test.ts
git commit -m "feat(push): gateway FCM real + config + wiring no server"
```

---

### Task 8: Flutter — registro de token e switch

> ⚠️ **BLOQUEADA** até o dono rodar `flutterfire configure` (gera `app/lib/firebase_options.dart`). Sem esse arquivo o app **não compila**. Se ele não existir, **pare, avise e pule para a Task 9** — as Tasks 1–7 entregam o backend completo em no-op.

**Files:**
- Create: `app/lib/core/push/push_service.dart`
- Create: `app/web/firebase-messaging-sw.js`
- Modify: `app/pubspec.yaml` (deps)
- Modify: `app/lib/main.dart` (init do Firebase)
- Modify: `app/lib/features/home/home_screen.dart` (switch)

**Interfaces:**
- Consumes: `POST /devices` e `PUT /me/push` (Task 5); `GET /me` expondo `push_enabled` (Task 2).
- Produces: nada (folha).

- [ ] **Step 1: Confirmar o pré-requisito**

Run: `ls app/lib/firebase_options.dart`
Expected: o arquivo existe. **Se não existir → PARE.** O dono precisa rodar `flutterfire configure` antes. Reporte e vá para a Task 9.

- [ ] **Step 2: Adicionar as dependências**

Run: `cd app && flutter pub add firebase_core firebase_messaging`
Expected: `pubspec.yaml` ganha `firebase_core` e `firebase_messaging`; `flutter pub get` roda sem erro.

- [ ] **Step 3: Inicializar o Firebase no boot**

Em `app/lib/main.dart`, o `main` atual é `void main() => runApp(const ProviderScope(child: HoloRaidApp()));`. Troque-o (e adicione os 2 imports) por:

```dart
import 'package:firebase_core/firebase_core.dart';
import 'firebase_options.dart';
```
```dart
void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  runApp(const ProviderScope(child: HoloRaidApp()));
}
```

O resto do arquivo (`HoloRaidApp`) não muda.

- [ ] **Step 4: Criar o serviço de push**

Crie `app/lib/core/push/push_service.dart`:

```dart
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:dio/dio.dart';
import '../network/api_client.dart';

class PushService {
  PushService(this._api);
  final ApiClient _api;

  String get _platform => kIsWeb ? 'web' : 'android';

  /// Pede permissão, registra o token atual e passa a re-registrar em cada refresh.
  Future<void> init() async {
    final fm = FirebaseMessaging.instance;
    final settings = await fm.requestPermission();
    if (settings.authorizationStatus == AuthorizationStatus.denied) return;

    final token = await fm.getToken();
    if (token != null) await _register(token);
    fm.onTokenRefresh.listen(_register);
  }

  Future<void> _register(String token) async {
    try {
      await _api.dio.post('/devices', data: {'token': token, 'platform': _platform});
    } on DioException {
      // best-effort: falhar em registrar não pode quebrar o boot do app
    }
  }
}
```

> O provider do cliente HTTP é o `apiClientProvider` (`app/lib/core/auth/auth_providers.dart:25`), que devolve um `ApiClient` expondo `.dio` — **não existe** `dioProvider`.

- [ ] **Step 5: Service worker do Web**

Crie `app/web/firebase-messaging-sw.js`:

```js
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

// Preencher com a config Web do projeto (a mesma do firebase_options.dart).
firebase.initializeApp({
  apiKey: 'FIREBASE_WEB_API_KEY',
  appId: 'FIREBASE_WEB_APP_ID',
  messagingSenderId: 'FIREBASE_SENDER_ID',
  projectId: 'FIREBASE_PROJECT_ID',
});

firebase.messaging();
```

> Os 4 valores saem do `app/lib/firebase_options.dart` (bloco `web`). Substitua-os pelos reais — este é o único ponto do app que não é gerado automaticamente.

- [ ] **Step 6: Switch na home + init do push**

A `HomeScreen` é hoje um `ConsumerWidget` (sem estado) e chama `loadMe()` direto no `future:` do `FutureBuilder` — o que re-dispara a cada rebuild. Para ter o switch e o init do push, ela vira `ConsumerStatefulWidget` e o `loadMe()` passa a ser guardado num campo (corrige o re-fetch de brinde).

Substitua **todo** o conteúdo de `app/lib/features/home/home_screen.dart` por:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth/auth_providers.dart';
import '../../core/push/push_service.dart';

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});
  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  late Future<Map<String, dynamic>> _me;

  @override
  void initState() {
    super.initState();
    _me = ref.read(authServiceProvider).loadMe();
    // Primeira tela autenticada: registra o device para push (best-effort).
    WidgetsBinding.instance.addPostFrameCallback((_) {
      PushService(ref.read(apiClientProvider)).init();
    });
  }

  Future<void> _setPush(bool v) async {
    await ref.read(apiClientProvider).dio.put('/me/push', data: {'enabled': v});
    setState(() { _me = ref.read(authServiceProvider).loadMe(); });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('HoloRaid'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () => ref.read(authStateProvider.notifier).logout(),
          ),
        ],
      ),
      body: Center(
        child: FutureBuilder<Map<String, dynamic>>(
          future: _me,
          builder: (context, snap) {
            if (!snap.hasData) return const CircularProgressIndicator();
            final me = snap.data!;
            return Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                CircleAvatar(
                  radius: 32,
                  child: Text((me['username'] as String? ?? '?').substring(0, 1).toUpperCase()),
                ),
                const SizedBox(height: 12),
                Text(me['username'] as String? ?? 'sem nome',
                    style: Theme.of(context).textTheme.titleLarge),
                Text('Papel: ${me['role'] ?? '-'}'),
                const SizedBox(height: 12),
                ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 360),
                  child: SwitchListTile(
                    title: const Text('Notificações'),
                    subtitle: const Text('Vaga confirmada, cancelamento e início'),
                    value: (me['push_enabled'] as bool?) ?? true,
                    onChanged: _setPush,
                  ),
                ),
                const SizedBox(height: 12),
                FilledButton.icon(
                  onPressed: () => context.push('/characters'),
                  icon: const Icon(Icons.people),
                  label: const Text('Meus Personagens'),
                ),
                const SizedBox(height: 12),
                FilledButton.icon(
                  onPressed: () => context.push('/raids'),
                  icon: const Icon(Icons.event),
                  label: const Text('Raids'),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}
```

> O `ConstrainedBox` é necessário: `SwitchListTile` dentro de um `Column` em `Center` não tem largura limitada e estoura o layout.

- [ ] **Step 7: Verificar**

Run: `cd app && flutter analyze`
Expected: `No issues found!`

- [ ] **Step 8: Commit**

```bash
git add app/lib/core/push/push_service.dart app/web/firebase-messaging-sw.js app/pubspec.yaml app/pubspec.lock app/lib/main.dart app/lib/features/home/home_screen.dart
git commit -m "feat(app): registro de token FCM e switch de notificacoes"
```

---

### Task 9: Verificação final

**Files:** nenhum (verificação).

**Interfaces:**
- Consumes: tudo das Tasks 1–8.
- Produces: evidência de que o #6 está completo e #1–#5d intactos.

- [ ] **Step 1: Suíte completa + typecheck + build**

Run: `cd backend && npm test`
Expected: **todos passam**. Antes do #6 eram 166; o plano acrescenta **~22** (3 em `users.routes`, 7 em `notification`, 2 em `raidJoin`, 1 em `push.routes`, 6 em `devices.routes`, 4 em `scheduler`, 2 em `config`) → espere **~188 passed, 0 failed**. Nenhum teste antigo pode falhar.

Run: `cd backend && npm run typecheck && npm run build`
Expected: ambos sem erros.

- [ ] **Step 2: Smoke real do ciclo completo contra o MySQL**

Prova que promover a waitlist gera a notificação certa, ponta a ponta, com repos **reais** (só o gateway é falso — não vamos disparar push de verdade num smoke):

```bash
cd backend && cat > smoke.tmp.ts <<'EOF'
import 'dotenv/config';
import { db } from './src/db/db';
import { createUserRepo } from './src/db/repositories/userRepo';
import { createPersonagemRepo } from './src/db/repositories/personagemRepo';
import { createRaidRepo } from './src/db/repositories/raidRepo';
import { createRaidPlayerRepo } from './src/db/repositories/raidPlayerRepo';
import { createDeviceTokenRepo } from './src/db/repositories/deviceTokenRepo';
import { createRaidService } from './src/modules/raids/raids.service';
import { createRaidJoinService } from './src/modules/raids/raidJoin.service';
import { createNotificationService } from './src/push/notification.service';

(async () => {
  const userRepo = createUserRepo(db);
  const personagemRepo = createPersonagemRepo(db);
  const raidRepo = createRaidRepo(db);
  const raidPlayerRepo = createRaidPlayerRepo(db);
  const deviceTokenRepo = createDeviceTokenRepo(db);
  const raidService = createRaidService({ raidRepo, raidPlayerRepo });
  const joinService = createRaidJoinService({ raidRepo, raidPlayerRepo, personagemRepo });

  const sends: any[] = [];
  const notify = createNotificationService({
    gateway: { async send(tokens, msg) { sends.push({ tokens, msg }); return { invalidTokens: [] }; } },
    deviceTokenRepo, userRepo,
  });

  const u1 = await userRepo.upsertByDiscordId({ discord_id: 'smk-1', username: 's1', nickname: null, avatar: null, email: null, role: 'user' });
  const u2 = await userRepo.upsertByDiscordId({ discord_id: 'smk-2', username: 's2', nickname: null, avatar: null, email: null, role: 'user' });
  await deviceTokenRepo.upsert(u2.id, 'tok-u2', 'android');

  const mk = (uid: number, nome: string) => personagemRepo.create({ usuario_id: uid, nome, faccao: 'Republic', classe: 'Guardian', especializacao: 'Vigilance', role: 'DPS', origin_story: 'Jedi Knight', item_level: 330 } as any);
  const p1 = await mk(u1.id, 'Smk1'); const p2 = await mk(u2.id, 'Smk2');

  const raid = await raidService.create({ sub: u1.id, role: 'user' }, {
    operation: 'Dread Palace', difficulty: 'HM', size: 8, faction: 'Republic', minimum_tier: 0,
    check_composition: true, slots_tank: 0, slots_heal: 0, slots_dps: 1, notes: null,
    start_at: new Date('2026-08-01T20:30:00Z'), disable_mentions: false,
  } as any);

  console.log('--> u1 join:', (await joinService.join(u1.id, raid.id, p1.id)).status, '(esperado confirmed)');
  console.log('--> u2 join:', (await joinService.join(u2.id, raid.id, p2.id)).status, '(esperado waitlist)');

  const { promoted } = await joinService.leave(u1.id, raid.id);
  console.log('--> promovido:', promoted, '| esperado:', u2.id);
  if (promoted) await notify.slotConfirmed(promoted, await raidService.getDetail(raid.id));

  console.log('--> push enviados:', sends.length, '(esperado 1)');
  console.log('--> tokens:', JSON.stringify(sends[0]?.tokens), '(esperado ["tok-u2"])');
  console.log('--> titulo:', JSON.stringify(sends[0]?.msg?.title));

  const ok = promoted === u2.id && sends.length === 1 && sends[0].tokens[0] === 'tok-u2';

  await raidRepo.delete(raid.id);
  await db.deleteFrom('usuarios').where('id', 'in', [u1.id, u2.id]).execute(); // CASCADE limpa chars e tokens
  console.log(ok ? '\n=== SMOKE OK ===' : '\n=== SMOKE FALHOU ===');
  await db.destroy();
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.log('FALHOU:', e.code || '', e.sqlMessage || e.message); process.exit(1); });
EOF
npx tsx smoke.tmp.ts; rm -f smoke.tmp.ts
```
Expected: `confirmed`, `waitlist`, promovido = id do u2, 1 push, tokens `["tok-u2"]`, `=== SMOKE OK ===`.

- [ ] **Step 3: Smoke manual com Firebase real (requer o setup do dono)**

Só é possível com `FIREBASE_SERVICE_ACCOUNT` no `.env` **e** o app configurado. Verifique:
1. App Android abre → concede permissão → `POST /devices` grava o token (confira `SELECT * FROM device_tokens`).
2. Encher uma raid, um confirmado sair → o promovido recebe **"You're in!"** no aparelho.
3. Cancelar a raid → todo o roster recebe **"Raid cancelled"**.
4. Raid com `start_at` a ~25 min → em até 1 min chega **"Raid starting soon"**, e só **uma vez** (confira `starting_notified_at` preenchido).
5. Desligar o switch "Notificações" → nada mais chega.

Expected: os 5 conferem. **Se o Firebase não estiver configurado, reporte isto como pendente — não marque como verificado.**

- [ ] **Step 4: Commit (se algum ajuste foi necessário)**

```bash
git add -A
git commit -m "test(push): verificacao do #6 (regressao + smokes)"
```

---

## Notas de execução

- **Branch:** execute em `feat/push-notifications` e faça merge `--no-ff` na `master` ao final (skill `finishing-a-development-branch`).
- **Ordem:** 1 → 2 → 3 → 4 → 5 → 6 → 7; a 8 depende de 1–7 **e** do Firebase configurado; a 9 fecha. Não paralelize.
- **Se a Task 8 estiver bloqueada** (sem `firebase_options.dart`), o #6 ainda é mergeável: o backend fica completo e inerte (no-op) até o dono configurar o Firebase e o app registrar tokens. Deixe isso explícito no relatório final.
- **Nunca commite** a service account key nem o `google-services.json` com credenciais reais.
