# Discord — Controle de menções (#5d) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ao postar uma raid no Discord, o bot pinga `@here` no post inicial de cada servidor; quem cria a raid pode desligar esse ping por raid (`disable_mentions`).

**Architecture:** Aditivo sobre #5a–#5c. Uma coluna nova `disable_mentions` em `raids` viaja com a raid (criada no app ou por `/create_raid`) até o `DiscordSync`, que decide o ping no **post inicial**. O `DiscordGateway` ganha um parâmetro opcional de `content`/`allowedMentions`. Edições e a mensagem "raid full" nunca pingam.

**Tech Stack:** Node/TypeScript, Kysely + mysql2, Zod, discord.js ^14, vitest. Flutter (Riverpod) para o switch no form.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-16-discord-mentions-design.md`.
- **Textos do Discord em INGLÊS** (comandos, descrições de opção, mensagens). O app permanece em português (i18n é ciclo próprio).
- **Sem gate por cargo.** "Required Discord Roles" foi **dropado** — não implemente seletor nem restrição de join.
- **Só o post inicial pinga.** Edições (`editEmbed`), `reportTo` e a mensagem "raid full" **nunca** pingam.
- **Ping fixo `@here`.** Sem cargo configurável nesta fatia.
- **`/edit_raid` não muda** — `disable_mentions` só existe no create.
- **Backend-only + 1 toque no Flutter** (switch no form de criar raid).
- **Best-effort:** falha do Discord nunca propaga (padrão já existente).
- **Regressão:** os **157 testes** de #1–#5c seguem verdes.
- **Commits:** autor `Leonardo de Souza Guimarães <leozinhoszg@gmail.com>`. **NUNCA** adicionar `Co-Authored-By: Claude` nem autorar como Claude.
- Comandos de backend rodam em `backend/`. Testes: `npx vitest run <arquivo>`. Typecheck: `npm run typecheck`.

---

### Task 1: Zod aceita `disable_mentions`

**Files:**
- Modify: `backend/src/modules/raids/raids.schemas.ts:4-16` (bloco `commonFields`)
- Test: `backend/tests/raidsValidation.test.ts`

**Interfaces:**
- Consumes: nada (primeira task).
- Produces: `raidCreateSchema` passa a emitir `disable_mentions: boolean` (default `false`) em `parsed.data`. `RaidCreateInput` ganha `disable_mentions: boolean`. `raidUpdateSchema` **não** muda (lista campos explicitamente).

- [ ] **Step 1: Write the failing test**

Em `backend/tests/raidsValidation.test.ts`, dentro do `describe('raidCreateSchema', ...)`, adicione antes do fechamento do describe:

```ts
  it('aceita disable_mentions e usa default false quando ausente', () => {
    const comFlag = raidCreateSchema.safeParse({ ...base, disable_mentions: true });
    expect(comFlag.success).toBe(true);
    expect(comFlag.success && comFlag.data.disable_mentions).toBe(true);

    const semFlag = raidCreateSchema.safeParse(base);
    expect(semFlag.success && semFlag.data.disable_mentions).toBe(false);
  });

  it('rejeita disable_mentions não-booleano', () => {
    expect(raidCreateSchema.safeParse({ ...base, disable_mentions: 'sim' }).success).toBe(false);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/raidsValidation.test.ts`
Expected: FAIL — `expected undefined to be false` (o campo ainda não existe no schema).

- [ ] **Step 3: Write minimal implementation**

Em `backend/src/modules/raids/raids.schemas.ts`, adicione a linha ao final do objeto `commonFields` (depois de `start_at`):

```ts
const commonFields = {
  operation: z.string().min(1),
  difficulty: z.enum(['SM', 'HM', 'NiM']),
  size: z.number().int().refine((v) => v === 8 || v === 16, 'size deve ser 8 ou 16'),
  faction: z.enum(['Republic', 'Empire']),
  minimum_tier: z.number().int().min(0).max(6),
  check_composition: z.boolean().default(false),
  slots_tank: z.number().int().min(0),
  slots_heal: z.number().int().min(0),
  slots_dps: z.number().int().min(0),
  notes: z.string().max(2000).nullish(),
  start_at: z.coerce.date(),
  disable_mentions: z.boolean().default(false),
};
```

> `raidUpdateSchema` lista os campos um a um, então **não** herda `disable_mentions`. Não altere esse bloco.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/raidsValidation.test.ts`
Expected: PASS (todos os `it` do arquivo).

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/raids/raids.schemas.ts backend/tests/raidsValidation.test.ts
git commit -m "feat(raids): raidCreateSchema aceita disable_mentions (default false)"
```

---

### Task 2: Persistência de `disable_mentions`

**Files:**
- Create: `backend/src/db/migrations/005_raid_mentions.ts`
- Modify: `backend/src/db/schema.ts:69-88` (`RaidsTable`)
- Modify: `backend/src/db/repositories/raidRepo.ts:8-14, 26-36, 52-56` (tipos, `COLS`, `norm`, `create`, `update`)
- Modify: `backend/src/modules/raids/raids.service.ts:85-94` (`duplicate`)
- Modify: `backend/tests/fakes/fakeRepos.ts:95` (`makeFakeRaidRepo.create`)
- Test: `backend/tests/raidService.test.ts`

**Interfaces:**
- Consumes: `raidCreateSchema` da Task 1.
- Produces:
  - `RaidRecord` ganha `disable_mentions: boolean` (sempre presente na leitura).
  - `NewRaid = Omit<RaidRecord, 'id' | 'status' | 'disable_mentions'> & { disable_mentions?: boolean }` — **opcional na escrita** (default `false`), para não quebrar os callers existentes.
  - `RaidDetail` (= `RaidRecord & { roster }`) expõe `disable_mentions: boolean` — é o que a Task 3 lê.

- [ ] **Step 1: Write the failing test**

Em `backend/tests/raidService.test.ts`, dentro do `describe('RaidService', ...)`, adicione:

```ts
  it('create persiste disable_mentions; ausente → false; duplicate copia', async () => {
    const { svc } = setup();

    const comFlag = await svc.create(user1, { ...baseInput, disable_mentions: true });
    expect(comFlag.disable_mentions).toBe(true);

    const copia = await svc.duplicate(user1, comFlag.id);
    expect(copia.disable_mentions).toBe(true);

    const semFlag = await svc.create(user1, baseInput);
    expect(semFlag.disable_mentions).toBe(false);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/raidService.test.ts`
Expected: FAIL — `expected undefined to be true` (o campo não existe no `RaidRecord`).

- [ ] **Step 3a: Criar a migration**

Crie `backend/src/db/migrations/005_raid_mentions.ts`:

```ts
import { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('raids')
    .addColumn('disable_mentions', 'boolean', (c) => c.notNull().defaultTo(false))
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('raids').dropColumn('disable_mentions').execute();
}
```

- [ ] **Step 3b: Tipar a coluna no schema Kysely**

Em `backend/src/db/schema.ts`, na interface `RaidsTable`, adicione a linha logo abaixo de `check_composition`:

```ts
export interface RaidsTable {
  id: Generated<number>;
  codigo: string;
  operation: string;
  difficulty: 'SM' | 'HM' | 'NiM';
  size: number;
  faction: 'Republic' | 'Empire';
  minimum_tier: number;
  check_composition: number; // MySQL boolean = tinyint (0/1)
  disable_mentions: number; // MySQL boolean = tinyint (0/1)
  slots_tank: number;
  slots_heal: number;
  slots_dps: number;
  notes: string | null;
  start_at: ColumnType<Date, Date | string, Date | string>;
  status: 'OPEN' | 'RUNNING' | 'FINISHED' | 'CANCELLED';
  discord_message_id: string | null;
  created_by: number;
  created_at: Created;
  updated_at: Updated;
}
```

- [ ] **Step 3c: Repo — tipos, COLS, norm, create, update**

Em `backend/src/db/repositories/raidRepo.ts`, substitua os tipos e o corpo do repo pelos abaixo (mudanças: `disable_mentions` em `RaidRecord`, `NewRaid` com o campo opcional, `COLS`, `norm`, `create`, `update`):

```ts
export type RaidRecord = {
  id: number; codigo: string; operation: string; difficulty: Difficulty; size: number;
  faction: Faction; minimum_tier: number; check_composition: boolean; disable_mentions: boolean;
  slots_tank: number; slots_heal: number; slots_dps: number; notes: string | null;
  start_at: Date; status: RaidStatus; created_by: number;
};
export type NewRaid = Omit<RaidRecord, 'id' | 'status' | 'disable_mentions'> & { disable_mentions?: boolean };
```

```ts
const COLS = ['id', 'codigo', 'operation', 'difficulty', 'size', 'faction', 'minimum_tier', 'check_composition', 'disable_mentions', 'slots_tank', 'slots_heal', 'slots_dps', 'notes', 'start_at', 'status', 'created_by'] as const;

const norm = (row: any): RaidRecord => ({ ...row, check_composition: !!row.check_composition, disable_mentions: !!row.disable_mentions, start_at: new Date(row.start_at) });
```

No `create`, converta o booleano para tinyint (default `0` quando ausente):

```ts
    async create(r) {
      const res = await db.insertInto('raids').values({ ...r, check_composition: r.check_composition ? 1 : 0, disable_mentions: r.disable_mentions ? 1 : 0, status: 'OPEN', updated_at: new Date() }).executeTakeFirstOrThrow();
      const row = await db.selectFrom('raids').select(COLS).where('id', '=', Number(res.insertId)).executeTakeFirstOrThrow();
      return norm(row);
    },
```

No `update`, trate `disable_mentions` como o `check_composition` (defensivo — `raidUpdateSchema` não o envia hoje):

```ts
    async update(id, patch) {
      const { check_composition, disable_mentions, ...rest } = patch;
      const set = {
        ...rest,
        updated_at: new Date(),
        ...(check_composition !== undefined ? { check_composition: check_composition ? 1 : 0 } : {}),
        ...(disable_mentions !== undefined ? { disable_mentions: disable_mentions ? 1 : 0 } : {}),
      };
      await db.updateTable('raids').set(set).where('id', '=', id).execute();
    },
```

- [ ] **Step 3d: `duplicate` copia o flag**

Em `backend/src/modules/raids/raids.service.ts`, no método `duplicate`, adicione `disable_mentions: r.disable_mentions,` ao objeto passado ao `create`:

```ts
    async duplicate(actor: Actor, id: number): Promise<RaidDetail> {
      const r = await load(id);
      const created = await deps.raidRepo.create({
        codigo: generateRaidCode(), operation: r.operation, difficulty: r.difficulty, size: r.size,
        faction: r.faction, minimum_tier: r.minimum_tier, check_composition: r.check_composition,
        disable_mentions: r.disable_mentions,
        slots_tank: r.slots_tank, slots_heal: r.slots_heal, slots_dps: r.slots_dps, notes: r.notes,
        start_at: r.start_at, created_by: actor.sub,
      });
      return detail(created);
    },
```

- [ ] **Step 3e: Fake repo espelha o default do banco**

Em `backend/tests/fakes/fakeRepos.ts`, no `makeFakeRaidRepo`, ajuste o `create` para aplicar o default `false` (o banco real faz isso via `DEFAULT false` + `norm`):

```ts
    async create(r: NewRaid) { const rec: RaidRecord = { id: seq++, status: 'OPEN', ...r, disable_mentions: r.disable_mentions ?? false }; rows.push(rec); return { ...rec }; },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/raidService.test.ts && npm run typecheck`
Expected: testes PASS e typecheck **sem erros** (o `NewRaid` opcional mantém `baseInput` dos testes existentes válido).

- [ ] **Step 5: Aplicar a migration no MySQL local**

Run: `cd backend && npm run migrate`
Expected: log indicando a migration `005_raid_mentions` aplicada, sem erro.

Verifique a coluna:

Run: `cd backend && node -e "const m=require('mysql2/promise');(async()=>{const c=await m.createConnection({host:process.env.DB_HOST||'127.0.0.1',user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME});const [r]=await c.query('SHOW COLUMNS FROM raids LIKE \"disable_mentions\"');console.log(r);await c.end();})()"`
Expected: uma linha com `Field: 'disable_mentions'`, `Null: 'NO'`, `Default: '0'`.

> Se as env vars não estiverem no shell, rode o comando com o `.env` carregado (ex.: `npx tsx -e "..."` usando `import 'dotenv/config'`), ou confira via cliente MySQL: `SHOW COLUMNS FROM raids LIKE 'disable_mentions';`

- [ ] **Step 6: Commit**

```bash
git add backend/src/db/migrations/005_raid_mentions.ts backend/src/db/schema.ts backend/src/db/repositories/raidRepo.ts backend/src/modules/raids/raids.service.ts backend/tests/fakes/fakeRepos.ts backend/tests/raidService.test.ts
git commit -m "feat(raids): persiste disable_mentions (migration 005 + repo + duplicate)"
```

---

### Task 3: Gateway com `content`/`allowedMentions` + ping no post inicial

**Files:**
- Modify: `backend/src/discord/gateway.ts:1-50` (tipos, interface, noop, impl real)
- Modify: `backend/src/discord/discordSync.ts:1-56` (`onCreated`, `onUpdated`)
- Modify: `backend/tests/fakes/fakeDiscord.ts` (registrar `opts`/`allowedMentions`)
- Test: `backend/tests/discordSync.test.ts`

**Interfaces:**
- Consumes: `RaidDetail.disable_mentions` (Task 2).
- Produces:
  - `export type AllowedMentions = { parse?: ('everyone' | 'roles' | 'users')[]; roles?: string[]; users?: string[] }`
  - `export type PostOpts = { content?: string; allowedMentions?: AllowedMentions }`
  - `DiscordGateway.postEmbed(channelId, embed, opts?: PostOpts)` e `DiscordGateway.postMessage(channelId, content, allowedMentions?: AllowedMentions)`.
  - `GatewayCall` do fake ganha `opts?` em `post` e `allowedMentions?` em `message`.

- [ ] **Step 1: Write the failing test**

Em `backend/tests/discordSync.test.ts`:

**(a)** adicione `disable_mentions: false` ao helper `detail` (para espelhar o default do banco):

```ts
const detail = (over: any = {}) => ({ id: 7, codigo: 'X7', operation: 'Dread Palace', difficulty: 'HM', size: 8, faction: 'Republic', minimum_tier: 0, check_composition: false, disable_mentions: false, slots_tank: 2, slots_heal: 2, slots_dps: 4, notes: null, start_at: new Date('2026-08-01T20:30:00Z'), status: 'OPEN', created_by: 1, roster: [], ...over } as any);
```

**(b)** adicione um describe novo ao final do arquivo:

```ts
describe('menções (#5d)', () => {
  it('onCreated pinga @here no post inicial de cada servidor', async () => {
    const { core, gateway } = await setup();
    await core.onCreated(detail());
    const posts = gateway.calls.filter((c) => c.kind === 'post') as any[];
    expect(posts).toHaveLength(2);
    for (const p of posts) {
      expect(p.opts?.content).toBe('@here');
      expect(p.opts?.allowedMentions).toEqual({ parse: ['everyone'] });
    }
  });

  it('onCreated com disable_mentions não pinga', async () => {
    const { core, gateway } = await setup();
    await core.onCreated(detail({ disable_mentions: true }));
    const posts = gateway.calls.filter((c) => c.kind === 'post') as any[];
    expect(posts).toHaveLength(2);
    for (const p of posts) {
      expect(p.opts?.content).toBeUndefined();
      expect(p.opts?.allowedMentions).toEqual({ parse: [] });
    }
  });

  it('mensagem "raid full" nunca pinga', async () => {
    const { core, gateway } = await setup();
    await core.onCreated(detail());
    await core.onUpdated(detail(), 'raidFull');
    const msgs = gateway.calls.filter((c) => c.kind === 'message') as any[];
    expect(msgs).toHaveLength(2);
    for (const m of msgs) expect(m.allowedMentions).toEqual({ parse: [] });
  });

  it('reportTo não pinga', async () => {
    const { core, gateway } = await setup();
    await core.reportTo(detail(), 'g9', 'c9');
    const posts = gateway.calls.filter((c) => c.kind === 'post') as any[];
    expect(posts).toHaveLength(1);
    expect(posts[0].opts?.content).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/discordSync.test.ts`
Expected: FAIL — `expected undefined to be '@here'` (o gateway ainda não recebe `opts`).

- [ ] **Step 3a: Gateway — tipos, interface e impl**

Substitua `backend/src/discord/gateway.ts` por:

```ts
import { Client, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, type TextChannel } from 'discord.js';
import type { RaidEmbed } from './embed';

export type AllowedMentions = { parse?: ('everyone' | 'roles' | 'users')[]; roles?: string[]; users?: string[] };
export type PostOpts = { content?: string; allowedMentions?: AllowedMentions };

export interface DiscordGateway {
  postEmbed(channelId: string, embed: RaidEmbed, opts?: PostOpts): Promise<string>;
  editEmbed(channelId: string, messageId: string, embed: RaidEmbed): Promise<void>;
  deleteMessage(channelId: string, messageId: string): Promise<void>;
  postMessage(channelId: string, content: string, allowedMentions?: AllowedMentions): Promise<void>;
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
    new ButtonBuilder().setCustomId(`hr:join:${embed.codigo}`).setLabel('Join').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`hr:leave:${embed.codigo}`).setLabel('Leave').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setLabel('View on web').setStyle(ButtonStyle.Link).setURL(embed.joinUrl),
  );
  return { embeds: [e], components: [row] };
}

export function createDiscordJsGateway(client: Client): DiscordGateway {
  const channel = async (id: string) => (await client.channels.fetch(id)) as TextChannel;
  return {
    async postEmbed(channelId, embed, opts) {
      const msg = await (await channel(channelId)).send({ ...render(embed), content: opts?.content, allowedMentions: opts?.allowedMentions });
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
    async postMessage(channelId, content, allowedMentions) {
      await (await channel(channelId)).send({ content, allowedMentions });
    },
  };
}
```

- [ ] **Step 3b: DiscordSync — decidir o ping no post inicial**

Em `backend/src/discord/discordSync.ts`, ajuste o import do gateway e os métodos `onCreated`/`onUpdated`:

```ts
import type { DiscordGateway, PostOpts, AllowedMentions } from './gateway';
```

Adicione as constantes logo acima de `createDiscordSyncCore`:

```ts
const NO_PING: AllowedMentions = { parse: [] };
const HERE_PING: AllowedMentions = { parse: ['everyone'] };
```

Substitua `onCreated` e `onUpdated` por:

```ts
    async onCreated(detail: RaidDetail): Promise<void> {
      const embed = buildRaidEmbed(detail, deps.appPublicUrl);
      const opts: PostOpts = detail.disable_mentions
        ? { allowedMentions: NO_PING }
        : { content: '@here', allowedMentions: HERE_PING };
      for (const g of await deps.guildConfigRepo.list()) {
        try {
          const messageId = await deps.gateway.postEmbed(g.raid_channel_id, embed, opts);
          await deps.msgRepo.create({ raid_id: detail.id, guild_id: g.guild_id, channel_id: g.raid_channel_id, message_id: messageId });
        } catch (err) { logger.error({ err, guild: g.guild_id }, 'discord: post falhou'); }
      }
    },
    async onUpdated(detail: RaidDetail, event: string): Promise<void> {
      const embed = buildRaidEmbed(detail, deps.appPublicUrl);
      for (const m of await deps.msgRepo.listByRaid(detail.id)) {
        try {
          await deps.gateway.editEmbed(m.channel_id, m.message_id, embed);
          if (event === 'raidFull') await deps.gateway.postMessage(m.channel_id, '🔴 Raid full — starting soon!', NO_PING);
        } catch (err) { logger.error({ err, channel: m.channel_id }, 'discord: edit falhou'); }
      }
    },
```

> `reportTo` fica **inalterado** — chama `postEmbed` sem `opts`, logo não pinga.

- [ ] **Step 3c: Fake gateway registra `opts`**

Substitua `backend/tests/fakes/fakeDiscord.ts` por:

```ts
import type { DiscordGateway, PostOpts, AllowedMentions } from '../../src/discord/gateway';
import type { RaidEmbed } from '../../src/discord/embed';

export type GatewayCall =
  | { kind: 'post'; channelId: string; embed: RaidEmbed; opts?: PostOpts }
  | { kind: 'edit'; channelId: string; messageId: string; embed: RaidEmbed }
  | { kind: 'delete'; channelId: string; messageId: string }
  | { kind: 'message'; channelId: string; content: string; allowedMentions?: AllowedMentions };

export function makeFakeGateway(opts: { failChannels?: string[] } = {}): DiscordGateway & { calls: GatewayCall[] } {
  const calls: GatewayCall[] = [];
  let seq = 1;
  const failIf = (channelId: string) => { if (opts.failChannels?.includes(channelId)) throw new Error('boom ' + channelId); };
  return {
    calls,
    async postEmbed(channelId, embed, postOpts) { failIf(channelId); calls.push({ kind: 'post', channelId, embed, opts: postOpts }); return 'msg-' + seq++; },
    async editEmbed(channelId, messageId, embed) { failIf(channelId); calls.push({ kind: 'edit', channelId, messageId, embed }); },
    async deleteMessage(channelId, messageId) { failIf(channelId); calls.push({ kind: 'delete', channelId, messageId }); },
    async postMessage(channelId, content, allowedMentions) { failIf(channelId); calls.push({ kind: 'message', channelId, content, allowedMentions }); },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/discordSync.test.ts && npm run typecheck`
Expected: todos PASS e typecheck sem erros.

> Se o TypeScript reclamar do `allowedMentions` no `channel.send` (discord.js espera `MessageMentionOptions`), o tipo `AllowedMentions` é estruturalmente compatível; caso persista, use `allowedMentions: opts?.allowedMentions as MessageMentionOptions` importando o tipo de `discord.js`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/discord/gateway.ts backend/src/discord/discordSync.ts backend/tests/fakes/fakeDiscord.ts backend/tests/discordSync.test.ts
git commit -m "feat(discord): pinga @here no post inicial e respeita disable_mentions"
```

---

### Task 4: Opção `disable_mentions` no `/create_raid`

**Files:**
- Modify: `backend/src/discord/bot.ts:8-19` (definição do `create_raid`)
- Modify: `backend/src/discord/commands.ts:51-61` (`handleCreateRaid`, objeto `input`)
- Test: `backend/tests/discordCommands.test.ts`

**Interfaces:**
- Consumes: `raidCreateSchema` (Task 1), `RaidRecord.disable_mentions` (Task 2).
- Produces: opção booleana `disable_mentions` no slash command; `handleCreateRaid` repassa o flag ao `raidService.create`.

- [ ] **Step 1: Write the failing test**

Em `backend/tests/discordCommands.test.ts`, adicione ao final do arquivo:

```ts
describe('/create_raid — disable_mentions (#5d)', () => {
  const baseOpts = { operation: 'Dread Palace', difficulty: 'HM', size: 8, faction: 'Republic', date: '2026-08-01', time: '20:30' };

  it('passa disable_mentions=true ao service', async () => {
    const { d, raidRepo } = deps();
    const i = fakeInteraction({ opts: { ...baseOpts, disable_mentions: true } });
    await handleCreateRaid(i, d);
    const raids = await raidRepo.list({});
    expect(raids).toHaveLength(1);
    expect(raids[0]!.disable_mentions).toBe(true);
  });

  it('sem a opção → disable_mentions false', async () => {
    const { d, raidRepo } = deps();
    const i = fakeInteraction({ opts: baseOpts });
    await handleCreateRaid(i, d);
    const raids = await raidRepo.list({});
    expect(raids).toHaveLength(1);
    expect(raids[0]!.disable_mentions).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/discordCommands.test.ts`
Expected: FAIL no primeiro teste — `expected false to be true` (o handler ainda ignora a opção).

- [ ] **Step 3a: Handler lê a opção**

Em `backend/src/discord/commands.ts`, no `handleCreateRaid`, adicione o campo ao objeto `input` (depois de `check_composition`):

```ts
  const input = {
    operation: i.getString('operation'),
    difficulty: i.getString('difficulty'),
    size,
    faction: i.getString('faction'),
    minimum_tier: i.getInteger('minimum_tier') ?? 0,
    check_composition: i.getBoolean('check_composition') ?? false,
    disable_mentions: i.getBoolean('disable_mentions') ?? false,
    ...defaultSlots(size),
    notes: i.getString('notes') ?? null,
    start_at: startAt,
  };
```

- [ ] **Step 3b: Declarar a opção no slash command**

Em `backend/src/discord/bot.ts`, no builder `createRaid`, adicione a opção booleana depois de `check_composition`:

```ts
    .addBooleanOption((o) => o.setName('check_composition').setDescription('Enforce role slots'))
    .addBooleanOption((o) => o.setName('disable_mentions').setDescription('Prevent the bot from pinging @here in the initial message. Default = false'))
    .addStringOption((o) => o.setName('notes').setDescription('Notes'));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/discordCommands.test.ts && npm run typecheck`
Expected: PASS e typecheck sem erros.

- [ ] **Step 5: Commit**

```bash
git add backend/src/discord/bot.ts backend/src/discord/commands.ts backend/tests/discordCommands.test.ts
git commit -m "feat(discord): opcao disable_mentions no /create_raid"
```

---

### Task 5: Switch "Disable mentions" no form do Flutter

**Files:**
- Modify: `app/lib/features/raids/raid_form_screen.dart:20` (estado), `:41-47` (payload), `:102-107` (UI)

**Interfaces:**
- Consumes: o backend aceita `disable_mentions: bool` no `POST /raids` (Tasks 1–2).
- Produces: nada (folha da árvore).

> Sem teste automatizado: o projeto não tem widget tests para os forms (só `app/test/widget_test.dart`). A verificação é `flutter analyze` + o smoke manual da Task 6.

- [ ] **Step 1: Adicionar o campo de estado**

Em `app/lib/features/raids/raid_form_screen.dart`, na classe `_RaidFormScreenState`, adicione o campo logo abaixo de `_checkComp`:

```dart
  bool _checkComp = false;
  bool _disableMentions = false;
```

- [ ] **Step 2: Enviar no payload de criação**

No método `_save`, adicione a chave ao mapa enviado ao `create` (depois de `check_composition`):

```dart
      await ref.read(raidsRepositoryProvider).create({
        'operation': _operation, 'difficulty': _difficulty, 'size': _size, 'faction': _faction,
        'minimum_tier': _minTier, 'check_composition': _checkComp,
        'disable_mentions': _disableMentions,
        'slots_tank': _tank, 'slots_heal': _heal, 'slots_dps': _dps,
        'notes': _notes.text.trim().isEmpty ? null : _notes.text.trim(),
        'start_at': startAt.toIso8601String(),
      });
```

- [ ] **Step 3: Adicionar o switch na UI**

No `build`, logo **depois** do `SwitchListTile` de "Check Composition", adicione:

```dart
            SwitchListTile(
              title: const Text('Disable mentions'),
              subtitle: const Text('Não pingar @here no Discord ao anunciar'),
              value: _disableMentions,
              onChanged: (v) => setState(() => _disableMentions = v),
            ),
```

- [ ] **Step 4: Verificar que o app compila e o lint passa**

Run: `cd app && flutter analyze`
Expected: `No issues found!`

- [ ] **Step 5: Commit**

```bash
git add app/lib/features/raids/raid_form_screen.dart
git commit -m "feat(app): switch Disable mentions no form de criar raid"
```

---

### Task 6: Verificação final — regressão + smokes reais

**Files:** nenhum (verificação).

**Interfaces:**
- Consumes: tudo das Tasks 1–5.
- Produces: evidência de que #5d está completo e #1–#5c intactos.

- [ ] **Step 1: Suíte completa do backend**

Run: `cd backend && npm test`
Expected: **todos os testes passam**. Antes do #5d eram 157; o plano acrescenta **9** (2 em `raidsValidation`, 1 em `raidService`, 4 em `discordSync`, 2 em `discordCommands`), então espere **166 passed, 0 failed**. Se algum teste antigo falhar, **pare e corrija** — a mudança é aditiva e não deve quebrar nada.

- [ ] **Step 2: Typecheck e build**

Run: `cd backend && npm run typecheck && npm run build`
Expected: ambos sem erros.

- [ ] **Step 3: Smoke real contra o MySQL local**

Confirme que o flag persiste de ponta a ponta no banco real (não só nos fakes):

Run: `cd backend && npx tsx -e "import 'dotenv/config'; import { db } from './src/db/db'; (async () => { const rows = await db.selectFrom('raids').select(['id','codigo','disable_mentions']).orderBy('id','desc').limit(3).execute(); console.log(rows); await db.destroy(); })()"`
Expected: lista as últimas raids com `disable_mentions: 0` (ou `1`). (`db` é o export de `backend/src/db/db.ts:27`.)

Depois, com o servidor rodando (`npm run dev`), crie uma raid com o flag ligado pela API e confirme que voltou `true`:

Expected: o `POST /raids` com `"disable_mentions": true` responde `201` e o JSON traz `"disable_mentions": true`.

- [ ] **Step 4: Smoke manual no Discord (requer `DISCORD_BOT_TOKEN`)**

Verifique os três comportamentos:
1. Criar uma raid **sem** disable_mentions → no canal configurado aparece **`@here`** acima do embed, e o ping notifica.
2. Criar uma raid **com** "Disable mentions" (app) ou `/create_raid disable_mentions:true` → o post aparece **sem** `@here` e **sem** notificar.
3. Dar **Join**/**Leave** no embed e encher a raid → o embed atualiza e a mensagem "🔴 Raid full" aparece, **sem** nenhum ping novo.

Expected: os três conferem. Anote qualquer divergência antes de seguir.

- [ ] **Step 5: Commit (se algum ajuste foi necessário)**

```bash
git add -A
git commit -m "test(discord): verificacao do #5d (regressao + smokes)"
```

---

## Notas de execução

- **Branch:** conforme o fluxo do projeto, execute numa branch `feat/discord-mentions` e faça merge `--no-ff` na `master` ao final (skill `finishing-a-development-branch`).
- **Ordem:** as tasks têm dependência linear (1 → 2 → 3 → 4; 5 depende de 1–2; 6 depende de todas). Não paralelize 1–4.
- **Se `npm run migrate` falhar** por o MySQL local estar fora do ar, suba o serviço antes (o Docker Desktop costuma estar desligado; o banco é local na 3306, base `holoraid`, usuário dedicado não-root).
