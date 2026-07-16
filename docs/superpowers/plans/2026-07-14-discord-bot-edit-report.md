# Discord Bot: /edit_raid + /report_raid (#5b) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar os slash commands `/edit_raid` (editar campos leves de uma raid) e `/report_raid` (repostar o embed de uma raid num canal, cross-server) ao bot do HoloRaid, reusando a infra do #5a.

**Architecture:** Aditivo sobre o #5a. `DiscordSync` ganha `reportTo` (aguardado, não fire-and-forget). Dois handlers novos em `commands.ts` reusam `raidService.update`/`getByCodigo` (#3) e o `RaidEventBus`. `CommandDeps.report` é opcional (não quebra o #5a). Sem migration, sem repo novo, nada do #1–#5a removido.

**Tech Stack:** Node/TypeScript, discord.js ^14, Zod, vitest. Nenhuma dep nova.

## Global Constraints

- **`/edit_raid`:** só campos leves (`minimum_tier`, `notes`, `date`+`time`→`start_at`, `check_composition`, `slots_tank/heal/dps`); reusa `raidService.update` (só OPEN, líder/admin, vagas ≥ confirmados). Emite `raidUpdated` no bus. Erros mapeados p/ inglês por `AppError.statusCode` (403/404/409/422).
- **`/report_raid`:** qualquer membro; só raids **OPEN**; **idempotente por canal** (já reportada → `'exists'`, sem duplicar). Grava `raid_discord_messages` → auto-edição do #5a passa a incluir o canal.
- **Comandos e respostas em INGLÊS.** `date`/`time` interpretados em UTC.
- Aditivo: os **133 testes** do #1–#5a seguem verdes. Backend: `npm run build`/`typecheck` limpos.

---

## Mapa de arquivos (modificados)

```
backend/src/
  discord/discordSync.ts   # (MOD) + reportTo no core; createDiscordSync expõe reportTo
  discord/commands.ts      # (MOD) + handleEditRaid, handleReportRaid, CommandDeps.report?
  discord/bot.ts           # (MOD) + defs edit_raid/report_raid + routing
  server.ts                # (MOD) passa report: discordSync.reportTo no attachBot
backend/tests/
  discordSync.test.ts      # (MOD) + testes de reportTo
  discordCommands.test.ts  # (MOD) + testes de handleEditRaid/handleReportRaid
```

---

### Task 1: DiscordSync.reportTo

**Files:**
- Modify: `backend/src/discord/discordSync.ts`
- Test: `backend/tests/discordSync.test.ts`

**Interfaces:**
- Consumes: `DiscordGateway`, `RaidDiscordMessageRepo`, `buildRaidEmbed` (#5a); `RaidDetail` (#3).
- Produces: `createDiscordSyncCore(deps)` ganha `reportTo(detail: RaidDetail, guildId: string, channelId: string): Promise<'posted' | 'exists' | 'failed'>`; `createDiscordSync(deps)` passa a retornar `RaidBroadcaster & { reportTo: ... }`.

- [ ] **Step 1: Adicionar testes de reportTo em `backend/tests/discordSync.test.ts`** (novo `describe` ao final; reusa o `setup()`/`detail()` já existentes no arquivo)

```ts
describe('reportTo', () => {
  it('canal novo → posted + grava ref', async () => {
    const { core, gateway, msgRepo } = await setup();
    const r = await core.reportTo(detail(), 'g9', 'c9');
    expect(r).toBe('posted');
    expect((await msgRepo.listByRaid(7)).some((m) => m.channel_id === 'c9')).toBe(true);
    expect(gateway.calls.filter((c) => c.kind === 'post')).toHaveLength(1);
  });

  it('canal já reportado → exists sem duplicar', async () => {
    const { core, msgRepo } = await setup();
    await core.reportTo(detail(), 'g9', 'c9');
    const r = await core.reportTo(detail(), 'g9', 'c9');
    expect(r).toBe('exists');
    expect((await msgRepo.listByRaid(7)).filter((m) => m.channel_id === 'c9')).toHaveLength(1);
  });

  it('gateway falha → failed e não grava ref', async () => {
    const { core, msgRepo } = await setup({ failChannels: ['cbad'] });
    const r = await core.reportTo(detail(), 'g9', 'cbad');
    expect(r).toBe('failed');
    expect((await msgRepo.listByRaid(7)).some((m) => m.channel_id === 'cbad')).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && npx vitest run tests/discordSync.test.ts`
Expected: FAIL — `core.reportTo` não existe.

- [ ] **Step 3: Adicionar `reportTo` ao core em `backend/src/discord/discordSync.ts`** — dentro do objeto retornado por `createDiscordSyncCore`, após `onRemoved`:

```ts
    async reportTo(detail: RaidDetail, guildId: string, channelId: string): Promise<'posted' | 'exists' | 'failed'> {
      const already = (await deps.msgRepo.listByRaid(detail.id)).some((m) => m.channel_id === channelId);
      if (already) return 'exists';
      try {
        const messageId = await deps.gateway.postEmbed(channelId, buildRaidEmbed(detail, deps.appPublicUrl));
        await deps.msgRepo.create({ raid_id: detail.id, guild_id: guildId, channel_id: channelId, message_id: messageId });
        return 'posted';
      } catch (err) {
        logger.error({ err, channel: channelId }, 'discord: report falhou');
        return 'failed';
      }
    },
```

- [ ] **Step 4: Expor `reportTo` em `createDiscordSync`** — alterar a assinatura e o objeto retornado:

```ts
export function createDiscordSync(deps: Deps): RaidBroadcaster & {
  reportTo(detail: RaidDetail, guildId: string, channelId: string): Promise<'posted' | 'exists' | 'failed'>;
} {
  const core = createDiscordSyncCore(deps);
  const run = (p: Promise<unknown>) => { p.catch((err) => logger.error({ err }, 'discord sync falhou')); };
  return {
    raidCreated(detail) { run(core.onCreated(detail)); },
    raidUpdated(detail, event) { run(core.onUpdated(detail, event)); },
    raidRemoved(id) { run(core.onRemoved(id)); },
    reportTo: core.reportTo,
  };
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd backend && npx vitest run tests/discordSync.test.ts && npm run typecheck`
Expected: PASS (7 testes: 4 do #5a + 3 novos); typecheck exit 0.

- [ ] **Step 6: Commit**

```bash
git add backend/src/discord/discordSync.ts backend/tests/discordSync.test.ts
git commit -m "feat(discord): DiscordSync.reportTo (repost idempotente por canal)"
```

---

### Task 2: handleReportRaid + CommandDeps.report

**Files:**
- Modify: `backend/src/discord/commands.ts`
- Test: `backend/tests/discordCommands.test.ts`

**Interfaces:**
- Consumes: `RaidService.getByCodigo` (#3), `RaidDetail` (#3).
- Produces: `CommandDeps.report?: (detail: RaidDetail, guildId: string, channelId: string) => Promise<'posted'|'exists'|'failed'>`; `handleReportRaid(i, deps): Promise<void>`.

- [ ] **Step 1: Estender `deps()` + adicionar testes em `backend/tests/discordCommands.test.ts`**

Trocar a função `deps()` existente por (adiciona `updated`, `report`, `reportCalls`):

```ts
function deps() {
  const guildConfigRepo = makeFakeGuildConfigRepo();
  const userRepo = makeFakeUserRepo();
  const personagemRepo = makeFakePersonagemRepo();
  const raidRepo = makeFakeRaidRepo();
  const raidPlayerRepo = makeFakeRaidPlayerRepo(personagemRepo);
  const raidService = createRaidService({ raidRepo, raidPlayerRepo });
  const created: string[] = [];
  const updated: string[] = [];
  const reportCalls: Array<[string, string]> = [];
  const bus: RaidBroadcaster = { raidCreated: () => created.push('created'), raidUpdated: (_d, e) => updated.push(e), raidRemoved: () => {} };
  const report = async (_detail: any, g: string, c: string) => { reportCalls.push([g, c]); return 'posted' as const; };
  return { d: { raidService, userRepo, guildConfigRepo, bus, report }, guildConfigRepo, raidRepo, created, updated, reportCalls };
}
```

Adicionar o import (só o handler desta task) e um helper de raid OPEN no topo do arquivo (após os imports existentes):

```ts
import { handleReportRaid } from '../src/discord/commands';

const openRaidInput = { operation: 'Dread Palace', difficulty: 'HM' as const, size: 8, faction: 'Republic' as const, minimum_tier: 0, check_composition: false, slots_tank: 2, slots_heal: 2, slots_dps: 4, notes: null, start_at: new Date('2026-08-01T20:30:00Z') };
```

Adicionar o bloco de testes:

```ts
describe('/report_raid', () => {
  it('raid OPEN + canal novo → reported', async () => {
    const { d } = deps();
    const u = await d.userRepo.upsertByDiscordId({ discord_id: 'o1', username: 'o1', nickname: null, avatar: null, email: null, role: 'user' });
    const raid = await d.raidService.create({ sub: u.id, role: 'user' }, openRaidInput);
    const i = fakeInteraction({ opts: { code: raid.codigo } });
    await handleReportRaid(i, d);
    expect(i.replies[0].content).toMatch(/reported/i);
  });

  it('já reportada → already posted', async () => {
    const { d } = deps();
    d.report = async () => 'exists';
    const u = await d.userRepo.upsertByDiscordId({ discord_id: 'o2', username: 'o2', nickname: null, avatar: null, email: null, role: 'user' });
    const raid = await d.raidService.create({ sub: u.id, role: 'user' }, openRaidInput);
    const i = fakeInteraction({ opts: { code: raid.codigo } });
    await handleReportRaid(i, d);
    expect(i.replies[0].content).toMatch(/already posted/i);
  });

  it('raid não-OPEN → recusa', async () => {
    const { d } = deps();
    const u = await d.userRepo.upsertByDiscordId({ discord_id: 'o3', username: 'o3', nickname: null, avatar: null, email: null, role: 'user' });
    const raid = await d.raidService.create({ sub: u.id, role: 'user' }, openRaidInput);
    await d.raidService.transition({ sub: u.id, role: 'user' }, raid.id, 'cancel');
    const i = fakeInteraction({ opts: { code: raid.codigo } });
    await handleReportRaid(i, d);
    expect(i.replies[0].content).toMatch(/not open/i);
  });

  it('report → failed → mensagem de permissão', async () => {
    const { d } = deps();
    d.report = async () => 'failed';
    const u = await d.userRepo.upsertByDiscordId({ discord_id: 'o4', username: 'o4', nickname: null, avatar: null, email: null, role: 'user' });
    const raid = await d.raidService.create({ sub: u.id, role: 'user' }, openRaidInput);
    const i = fakeInteraction({ opts: { code: raid.codigo } });
    await handleReportRaid(i, d);
    expect(i.replies[0].content).toMatch(/permission/i);
  });

  it('código inexistente → not found', async () => {
    const { d } = deps();
    const i = fakeInteraction({ opts: { code: 'nope' } });
    await handleReportRaid(i, d);
    expect(i.replies[0].content).toMatch(/not found/i);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && npx vitest run tests/discordCommands.test.ts`
Expected: FAIL — `handleReportRaid` não existe.

- [ ] **Step 3: Ajustar imports e `CommandDeps` em `backend/src/discord/commands.ts`**

Trocar os imports do topo:

```ts
import { raidCreateSchema, raidUpdateSchema } from '../modules/raids/raids.schemas';
import { defaultSlots } from '../modules/raids/raids.util';
import type { RaidService, RaidDetail } from '../modules/raids/raids.service';
import type { UserRepo } from '../db/repositories/userRepo';
import type { GuildConfigRepo } from '../db/repositories/guildConfigRepo';
import type { RaidBroadcaster } from '../realtime/broadcaster';
import { AppError } from '../common/errors/AppError';
```

E adicionar `report?` em `CommandDeps`:

```ts
export type CommandDeps = {
  raidService: RaidService;
  userRepo: UserRepo;
  guildConfigRepo: GuildConfigRepo;
  bus: RaidBroadcaster;
  report?: (detail: RaidDetail, guildId: string, channelId: string) => Promise<'posted' | 'exists' | 'failed'>;
};
```

- [ ] **Step 4: Implementar `handleReportRaid` em `backend/src/discord/commands.ts`** (ao final do arquivo)

```ts
export async function handleReportRaid(i: CommandInteraction, deps: CommandDeps): Promise<void> {
  const code = i.getString('code');
  if (!code) { await i.reply({ content: 'Provide the raid code.', ephemeral: true }); return; }
  if (!i.guildId) { await i.reply({ content: 'Use this command in a server.', ephemeral: true }); return; }
  if (!deps.report) { await i.reply({ content: 'Reporting is unavailable.', ephemeral: true }); return; }

  let detail: RaidDetail;
  try { detail = await deps.raidService.getByCodigo(code); }
  catch { await i.reply({ content: 'Raid not found.', ephemeral: true }); return; }

  if (detail.status !== 'OPEN') { await i.reply({ content: "This raid isn't open for sign-ups.", ephemeral: true }); return; }

  const result = await deps.report(detail, i.guildId, i.channelId);
  const msg = result === 'posted' ? 'Raid reported in this channel. ✅'
    : result === 'exists' ? 'This raid is already posted in this channel.'
      : "Couldn't post here — check my permissions.";
  await i.reply({ content: msg, ephemeral: true });
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd backend && npx vitest run tests/discordCommands.test.ts && npm run typecheck`
Expected: PASS (os do #5a + 5 novos de `/report_raid`); typecheck exit 0. (O import só traz `handleReportRaid`, então o arquivo carrega; os testes de `/edit_raid` vêm na Task 3.)

- [ ] **Step 6: Commit**

```bash
git add backend/src/discord/commands.ts backend/tests/discordCommands.test.ts
git commit -m "feat(discord): /report_raid (qualquer membro, só OPEN, idempotente por canal)"
```

---

### Task 3: handleEditRaid + mapeamento de erro

**Files:**
- Modify: `backend/src/discord/commands.ts`
- Test: `backend/tests/discordCommands.test.ts`

**Interfaces:**
- Consumes: `raidUpdateSchema` (#3), `raidService.getByCodigo`/`update` (#3), `AppError` (#1), `parseStartAt` (já em `commands.ts`).
- Produces: `handleEditRaid(i, deps): Promise<void>` + `mapUpdateError(err): string`.

- [ ] **Step 1: Adicionar o import do handler + testes de `/edit_raid` em `backend/tests/discordCommands.test.ts`**

Primeiro, incluir `handleEditRaid` no import existente:

```ts
import { handleEditRaid, handleReportRaid } from '../src/discord/commands';
```

Depois, adicionar o bloco de testes:

```ts
describe('/edit_raid', () => {
  async function ownedRaid(d: any, discordId = 'd123') {
    const owner = await d.userRepo.upsertByDiscordId({ discord_id: discordId, username: 'diego', nickname: null, avatar: null, email: null, role: 'user' });
    const raid = await d.raidService.create({ sub: owner.id, role: 'user' }, openRaidInput);
    return { owner, raid };
  }

  it('líder edita notes e emite raidUpdated', async () => {
    const { d, updated } = deps();
    const { raid } = await ownedRaid(d);
    const i = fakeInteraction({ opts: { code: raid.codigo, notes: 'bring pots' } });
    await handleEditRaid(i, d);
    expect(updated).toContain('raidUpdated');
    expect(i.replies[0].content).toMatch(/updated/i);
  });

  it('código inexistente → not found', async () => {
    const { d } = deps();
    const i = fakeInteraction({ opts: { code: 'nope' } });
    await handleEditRaid(i, d);
    expect(i.replies[0].content).toMatch(/not found/i);
  });

  it('não-líder → recusa (403)', async () => {
    const { d } = deps();
    const { raid } = await ownedRaid(d, 'owner');
    const i = fakeInteraction({ user: { id: 'intruder', username: 'intruder' }, opts: { code: raid.codigo, notes: 'hax' } });
    await handleEditRaid(i, d);
    expect(i.replies[0].content).toMatch(/your own/i);
  });

  it('raid não-OPEN → recusa (409)', async () => {
    const { d } = deps();
    const { owner, raid } = await ownedRaid(d);
    await d.raidService.transition({ sub: owner.id, role: 'user' }, raid.id, 'start');
    const i = fakeInteraction({ opts: { code: raid.codigo, notes: 'x' } });
    await handleEditRaid(i, d);
    expect(i.replies[0].content).toMatch(/no longer be edited/i);
  });

  it('date sem time → erro de validação', async () => {
    const { d } = deps();
    const { raid } = await ownedRaid(d);
    const i = fakeInteraction({ opts: { code: raid.codigo, date: '2026-09-01' } });
    await handleEditRaid(i, d);
    expect(i.replies[0].content).toMatch(/both date and time/i);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && npx vitest run tests/discordCommands.test.ts -t "/edit_raid"`
Expected: FAIL — `handleEditRaid` não existe.

- [ ] **Step 3: Implementar `handleEditRaid` + `mapUpdateError` em `backend/src/discord/commands.ts`** (ao final)

```ts
function mapUpdateError(err: unknown): string {
  if (err instanceof AppError) {
    switch (err.statusCode) {
      case 403: return 'You can only edit your own raids.';
      case 404: return 'Raid not found.';
      case 409: return 'This raid can no longer be edited.';
      case 422: return 'Invalid values. Check the fields.';
    }
  }
  return 'Something went wrong.';
}

export async function handleEditRaid(i: CommandInteraction, deps: CommandDeps): Promise<void> {
  const code = i.getString('code');
  if (!code) { await i.reply({ content: 'Provide the raid code.', ephemeral: true }); return; }

  let current: RaidDetail;
  try { current = await deps.raidService.getByCodigo(code); }
  catch { await i.reply({ content: 'Raid not found.', ephemeral: true }); return; }

  const patch: Record<string, unknown> = {};
  const minTier = i.getInteger('minimum_tier'); if (minTier !== null) patch.minimum_tier = minTier;
  const notes = i.getString('notes'); if (notes !== null) patch.notes = notes;
  const checkComp = i.getBoolean('check_composition'); if (checkComp !== null) patch.check_composition = checkComp;
  const st = i.getInteger('slots_tank'); if (st !== null) patch.slots_tank = st;
  const sh = i.getInteger('slots_heal'); if (sh !== null) patch.slots_heal = sh;
  const sd = i.getInteger('slots_dps'); if (sd !== null) patch.slots_dps = sd;

  const date = i.getString('date');
  const time = i.getString('time');
  if (date !== null || time !== null) {
    const startAt = parseStartAt(date, time);
    if (!startAt) { await i.reply({ content: 'Provide both date (YYYY-MM-DD) and time (HH:MM) in UTC.', ephemeral: true }); return; }
    patch.start_at = startAt;
  }

  if (Object.keys(patch).length === 0) { await i.reply({ content: 'Nothing to update — provide at least one field.', ephemeral: true }); return; }

  const parsed = raidUpdateSchema.safeParse(patch);
  if (!parsed.success) { await i.reply({ content: 'Invalid values. Check the fields.', ephemeral: true }); return; }

  const user = await deps.userRepo.upsertByDiscordId({ discord_id: i.user.id, username: i.user.username, nickname: null, avatar: null, email: null, role: 'user' });
  try {
    const updated = await deps.raidService.update({ sub: user.id, role: user.role }, current.id, parsed.data);
    deps.bus.raidUpdated(updated, 'raidUpdated');
    await i.reply({ content: `Raid updated: **${updated.operation}** (${updated.codigo}).`, ephemeral: true });
  } catch (err) {
    await i.reply({ content: mapUpdateError(err), ephemeral: true });
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && npx vitest run tests/discordCommands.test.ts && npm run typecheck`
Expected: PASS (todos: #5a + report + edit); typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
git add backend/src/discord/commands.ts backend/tests/discordCommands.test.ts
git commit -m "feat(discord): /edit_raid (campos leves, reusa raidService.update + bus)"
```

---

### Task 4: Command defs + routing + wiring

**Files:**
- Modify: `backend/src/discord/bot.ts`
- Modify: `backend/src/server.ts`

**Interfaces:**
- Consumes: `handleEditRaid`/`handleReportRaid` (Tasks 2-3), `discordSync.reportTo` (Task 1).
- Produces: `buildCommandDefs` inclui `edit_raid` + `report_raid`; roteador despacha os dois; `server.ts` injeta `report`.

> Verificado por **build** + suíte; os comandos ao vivo são **smoke manual** (bot token).

- [ ] **Step 1: Adicionar as defs e o routing em `backend/src/discord/bot.ts`**

No import dos handlers, incluir os novos:

```ts
import { handleCreateRaid, handleSetRaidChannel, handleEditRaid, handleReportRaid, type CommandDeps, type CommandInteraction } from './commands';
```

Em `buildCommandDefs`, antes do `return [...]`, adicionar:

```ts
  const editRaid = new SlashCommandBuilder()
    .setName('edit_raid')
    .setDescription('Edit an open raid (times are in UTC)')
    .addStringOption((o) => o.setName('code').setDescription('Raid code').setRequired(true))
    .addIntegerOption((o) => o.setName('minimum_tier').setDescription('Minimum Tier 0-6').setMinValue(0).setMaxValue(6))
    .addStringOption((o) => o.setName('notes').setDescription('Notes'))
    .addStringOption((o) => o.setName('date').setDescription('Date YYYY-MM-DD (UTC)'))
    .addStringOption((o) => o.setName('time').setDescription('Time HH:MM (UTC)'))
    .addBooleanOption((o) => o.setName('check_composition').setDescription('Enforce role slots'))
    .addIntegerOption((o) => o.setName('slots_tank').setDescription('Tank slots').setMinValue(0))
    .addIntegerOption((o) => o.setName('slots_heal').setDescription('Healer slots').setMinValue(0))
    .addIntegerOption((o) => o.setName('slots_dps').setDescription('DPS slots').setMinValue(0));

  const reportRaid = new SlashCommandBuilder()
    .setName('report_raid')
    .setDescription('Post a raid in this channel')
    .addStringOption((o) => o.setName('code').setDescription('Raid code').setRequired(true));
```

E trocar o `return`:

```ts
  return [createRaid.toJSON(), setChannel.toJSON(), editRaid.toJSON(), reportRaid.toJSON()];
```

No roteador `client.on(Events.InteractionCreate, ...)`, adicionar os dois ramos:

```ts
      if (interaction.commandName === 'create_raid') await handleCreateRaid(i, deps);
      else if (interaction.commandName === 'set_raid_channel') await handleSetRaidChannel(i, deps);
      else if (interaction.commandName === 'edit_raid') await handleEditRaid(i, deps);
      else if (interaction.commandName === 'report_raid') await handleReportRaid(i, deps);
```

- [ ] **Step 2: Injetar `report` no `attachBot` em `backend/src/server.ts`**

Trocar a chamada `attachBot(...)`:

```ts
if (discordClient && cfg.DISCORD_BOT_TOKEN) {
  attachBot(discordClient, { token: cfg.DISCORD_BOT_TOKEN, clientId: cfg.DISCORD_CLIENT_ID, raidService, userRepo, guildConfigRepo, bus, report: discordSync.reportTo });
}
```

- [ ] **Step 3: Build + suíte inteira**

Run: `cd backend && npm run build && npm test 2>&1 | tail -3`
Expected: build exit 0; todos os testes verdes.

- [ ] **Step 4: (Smoke manual — bot token) testar os comandos**

Com `DISCORD_BOT_TOKEN` no `.env` e o bot num servidor: criar uma raid; `/edit_raid code:<código> notes:...` e ver o embed mudar em todos os canais; `/report_raid code:<código>` num canal de outro servidor e ver a raid aparecer + passar a ser auto-editada.

- [ ] **Step 5: Commit**

```bash
git add backend/src/discord/bot.ts backend/src/server.ts
git commit -m "feat(discord): registra e roteia /edit_raid e /report_raid + wiring do report"
```

---

## Verificação final (Definition of Done)

- [ ] `cd backend && npm test` — toda a suíte verde (discordSync +3, discordCommands +10, + #1–#5a).
- [ ] `cd backend && npm run build && npm run typecheck` — exit 0.
- [ ] Smoke manual (Task 4, bot token): `/edit_raid` edita em todos os canais; `/report_raid` cross-server aparece e passa a ser auto-editado.

---

## Self-review (cobertura do spec)

- `/edit_raid` campos leves + reusa update + emite bus + erros mapeados: Task 3. ✓
- `/report_raid` qualquer membro, só OPEN, idempotente por canal, best-effort: Tasks 1-2. ✓
- `reportTo` no DiscordSync (posted/exists/failed): Task 1. ✓
- `CommandDeps.report` opcional (não quebra #5a): Task 2. ✓
- Command defs + routing + wiring: Task 4. ✓
- Aditivo; #1–#5a verdes: Tasks 1-4. ✓
