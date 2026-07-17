# Discord Native Join (#5c) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar join nativo no Discord — botões `[Join]`/`[Leave]` no embed da raid, com seletor efêmero de personagem elegível — reusando `raidJoinService` (#3) e o `RaidEventBus` (#4), sem sair para a web.

**Architecture:** Aditivo sobre #5a/#5b. O embed passa a carregar o `codigo` e o gateway renderiza botões interativos. Um arquivo novo `discord/components.ts` traz três handlers testáveis (sem discord.js) atrás de uma interface mínima `ComponentInteraction`. O `bot.ts` roteia button/select interactions por prefixo de `customId` e adapta a interação do discord.js. `server.ts` injeta os novos deps. Sem migration, sem repo novo.

**Tech Stack:** Node/TypeScript, discord.js ^14 (`ButtonBuilder`, `StringSelectMenuBuilder`, `ActionRowBuilder`), vitest. Nenhuma dep nova.

## Global Constraints

- **Backend-only**, aditivo: os **146 testes** do #1–#5b seguem verdes; o app já mostra o join ao vivo via socket (`playerJoined`) — nada de Flutter.
- **Botões no embed:** `[Join]` (Primary), `[Leave]` (Secondary), `[View on web]` (Link, mantém `joinUrl`). `customId`s: `hr:join:<codigo>`, `hr:leave:<codigo>`, `hr:pick:<codigo>`.
- **Elegibilidade do char:** facção = `raid.faction` **e** `calcularTier(total_points) >= raid.minimum_tier`.
- **Sem char elegível → fallback:** mensagem efêmera com o motivo + link para `appPublicUrl` (`https://holoraid.fun`).
- **Qualquer membro** pode clicar. Join só em raid **OPEN**. Reusa `raidJoinService.join/leave` + `bus.raidUpdated`.
- **Mensagens e labels em INGLÊS.** Erros do serviço mapeados por `AppError.statusCode` (403/404/409/422).
- Commits sob `Leonardo de Souza Guimarães <leozinhoszg@gmail.com>` — **sem** trailer Co-Authored-By.

---

## Mapa de arquivos

```
backend/src/
  discord/embed.ts       # (MOD) RaidEmbed ganha codigo; buildRaidEmbed preenche
  discord/gateway.ts     # (MOD) render(): [Join]/[Leave] interativos + [View on web] link
  discord/components.ts  # (NOVO) handleJoinClick/handleCharacterPick/handleLeaveClick + tipos
  discord/bot.ts         # (MOD) routing de button/select + adaptComponent + deps
  server.ts              # (MOD) injeta personagemRepo, raidJoinService, appPublicUrl no attachBot
backend/tests/
  embed.test.ts          # (MOD) asserção do codigo
  components.test.ts      # (NOVO) testes dos 3 handlers
```

Referência (nada disso muda): `raidJoinService.join(actorId, raidId, personagemId): Promise<{status:'confirmed'|'waitlist'}>` e `.leave(actorId, raidId): Promise<void>` em [raidJoin.service.ts](backend/src/modules/raids/raidJoin.service.ts); `isRaidFull(detail)` e `RaidDetail` (com `roster[].usuario_id/status/role`) em [raids.service.ts](backend/src/modules/raids/raids.service.ts); `calcularTier(points)` em [tier.ts](backend/src/common/progression/tier.ts); `AppError.statusCode` 403/404/409/422 em [AppError.ts](backend/src/common/errors/AppError.ts).

---

### Task 1: Embed carrega o código + botões interativos

**Files:**
- Modify: `backend/src/discord/embed.ts`
- Modify: `backend/src/discord/gateway.ts`
- Test: `backend/tests/embed.test.ts`

**Interfaces:**
- Consumes: `RaidDetail.codigo` (#3).
- Produces: `RaidEmbed` ganha `codigo: string`; `render()` no gateway usa `embed.codigo` para os `customId`s `hr:join:<codigo>` / `hr:leave:<codigo>`.

- [ ] **Step 1: Ajustar o teste do embed** em `backend/tests/embed.test.ts` — adicionar uma asserção do `codigo` ao primeiro `it` (o `detail` já tem `codigo: 'ABC123'`):

Depois da linha `expect(e.joinUrl).toBe('https://holoraid.fun/r/ABC123');`, inserir:

```ts
    expect(e.codigo).toBe('ABC123');
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && npx vitest run tests/embed.test.ts`
Expected: FAIL — `e.codigo` é `undefined` (property não existe).

- [ ] **Step 3: Adicionar `codigo` ao `RaidEmbed` e ao `buildRaidEmbed`** em `backend/src/discord/embed.ts`.

Trocar a interface:

```ts
export interface RaidEmbed {
  title: string;
  fields: { name: string; value: string }[];
  joinUrl: string;
  codigo: string;
}
```

E o objeto retornado por `buildRaidEmbed` (adicionar `codigo` após `joinUrl`):

```ts
    joinUrl: `${appPublicUrl}/r/${detail.codigo}`,
    codigo: detail.codigo,
  };
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && npx vitest run tests/embed.test.ts`
Expected: PASS.

- [ ] **Step 5: Trocar os botões em `render()`** em `backend/src/discord/gateway.ts` — substituir a função `render` inteira (o `ActionRowBuilder`/`ButtonBuilder`/`ButtonStyle` já estão importados no topo do arquivo):

```ts
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
```

- [ ] **Step 6: Build + typecheck**

Run: `cd backend && npm run build && npm run typecheck`
Expected: exit 0 nos dois (o gateway compila com os novos botões; `RaidEmbed.codigo` é preenchido em todos os call sites — `buildRaidEmbed` é o único produtor).

- [ ] **Step 7: Commit**

```bash
git add backend/src/discord/embed.ts backend/src/discord/gateway.ts backend/tests/embed.test.ts
git commit -m "feat(discord): embed com codigo + botoes Join/Leave interativos"
```

---

### Task 2: `handleJoinClick` + tipos e helpers de componente

**Files:**
- Create: `backend/src/discord/components.ts`
- Test: `backend/tests/components.test.ts`

**Interfaces:**
- Consumes: `RaidService.getByCodigo/getDetail` (#3), `UserRepo.upsertByDiscordId` (#1), `PersonagemRepo.findByUsuario` (#2), `calcularTier` (#2), `RaidDetail.roster[].usuario_id`.
- Produces:
  - `interface ComponentInteraction { user: {id,username}; guildId: string|null; channelId: string; customId: string; values: string[]; reply(m:{content:string;ephemeral?:boolean}):Promise<void>; replySelect(m:{customId:string;placeholder:string;options:{label:string;value:string}[]}):Promise<void> }`
  - `type ComponentDeps = { raidService; userRepo; personagemRepo; raidJoinService; bus; appPublicUrl }`
  - `codeFromCustomId(customId: string): string`
  - `handleJoinClick(i: ComponentInteraction, deps: ComponentDeps): Promise<void>`

- [ ] **Step 1: Criar `backend/tests/components.test.ts` com o harness + testes do Join click**

```ts
import { handleJoinClick, type ComponentInteraction, type ComponentDeps } from '../src/discord/components';
import { makeFakeUserRepo, makeFakePersonagemRepo, makeFakeRaidRepo, makeFakeRaidPlayerRepo } from './fakes/fakeRepos';
import { createRaidService } from '../src/modules/raids/raids.service';
import { createRaidJoinService } from '../src/modules/raids/raidJoin.service';
import type { RaidBroadcaster } from '../src/realtime/broadcaster';

function deps() {
  const userRepo = makeFakeUserRepo();
  const personagemRepo = makeFakePersonagemRepo();
  const raidRepo = makeFakeRaidRepo();
  const raidPlayerRepo = makeFakeRaidPlayerRepo(personagemRepo);
  const raidService = createRaidService({ raidRepo, raidPlayerRepo });
  const raidJoinService = createRaidJoinService({ raidRepo, raidPlayerRepo, personagemRepo });
  const events: string[] = [];
  const bus: RaidBroadcaster = { raidCreated: () => {}, raidUpdated: (_d, e) => events.push(e), raidRemoved: () => {} };
  const d: ComponentDeps = { raidService, userRepo, personagemRepo, raidJoinService, bus, appPublicUrl: 'https://holoraid.fun' };
  return { d, events };
}

function fakeInteraction(over: { user?: { id: string; username: string }; customId: string; values?: string[] }): ComponentInteraction & { replies: any[]; selects: any[] } {
  const replies: any[] = [];
  const selects: any[] = [];
  return {
    user: over.user ?? { id: 'd1', username: 'diego' },
    guildId: 'g1', channelId: 'c1',
    customId: over.customId,
    values: over.values ?? [],
    reply: async (m) => { replies.push(m); },
    replySelect: async (m) => { selects.push(m); },
    replies, selects,
  };
}

async function seedRaid(d: ComponentDeps, over: Record<string, any> = {}) {
  const leader = await d.userRepo.upsertByDiscordId({ discord_id: 'leader', username: 'leader', nickname: null, avatar: null, email: null, role: 'user' });
  return d.raidService.create({ sub: leader.id, role: 'user' }, {
    operation: 'Dread Palace', difficulty: 'HM', size: 8, faction: 'Republic', minimum_tier: 0,
    check_composition: false, slots_tank: 2, slots_heal: 2, slots_dps: 4, notes: null,
    start_at: new Date('2026-08-01T20:30:00Z'), ...over,
  } as any);
}

async function giveChar(d: ComponentDeps, discordId: string, over: Record<string, any> = {}) {
  const u = await d.userRepo.upsertByDiscordId({ discord_id: discordId, username: discordId, nickname: null, avatar: null, email: null, role: 'user' });
  const p = await d.personagemRepo.create({ usuario_id: u.id, nome: 'Kael', faccao: 'Republic', classe: 'Sniper', especializacao: null, role: 'DPS', origin_story: null, item_level: 306, ...over } as any);
  return { u, p };
}

describe('/join (click)', () => {
  it('sem personagem → aponta para a web, sem select', async () => {
    const { d } = deps();
    const raid = await seedRaid(d);
    const i = fakeInteraction({ customId: `hr:join:${raid.codigo}` });
    await handleJoinClick(i, d);
    expect(i.replies[0].content).toMatch(/create one/i);
    expect(i.replies[0].content).toContain('holoraid.fun');
    expect(i.selects).toHaveLength(0);
  });

  it('char de facção errada → recusa com motivo', async () => {
    const { d } = deps();
    const raid = await seedRaid(d);
    await giveChar(d, 'd1', { faccao: 'Empire' });
    const i = fakeInteraction({ customId: `hr:join:${raid.codigo}` });
    await handleJoinClick(i, d);
    expect(i.replies[0].content).toMatch(/Republic character/i);
    expect(i.selects).toHaveLength(0);
  });

  it('char abaixo do Tier mínimo → recusa com motivo', async () => {
    const { d } = deps();
    const raid = await seedRaid(d, { minimum_tier: 3 });
    await giveChar(d, 'd1'); // total_points 0 → Tier 0
    const i = fakeInteraction({ customId: `hr:join:${raid.codigo}` });
    await handleJoinClick(i, d);
    expect(i.replies[0].content).toMatch(/Tier 3/);
    expect(i.selects).toHaveLength(0);
  });

  it('char elegível → responde com select das opções', async () => {
    const { d } = deps();
    const raid = await seedRaid(d);
    const { p } = await giveChar(d, 'd1');
    const i = fakeInteraction({ customId: `hr:join:${raid.codigo}` });
    await handleJoinClick(i, d);
    expect(i.replies).toHaveLength(0);
    expect(i.selects[0].customId).toBe(`hr:pick:${raid.codigo}`);
    expect(i.selects[0].options).toHaveLength(1);
    expect(i.selects[0].options[0].value).toBe(String(p.id));
    expect(i.selects[0].options[0].label).toMatch(/Kael/);
  });

  it('já inscrito → pede para usar Leave', async () => {
    const { d } = deps();
    const raid = await seedRaid(d);
    const { u, p } = await giveChar(d, 'd1');
    await d.raidJoinService.join(u.id, raid.id, p.id);
    const i = fakeInteraction({ customId: `hr:join:${raid.codigo}` });
    await handleJoinClick(i, d);
    expect(i.replies[0].content).toMatch(/already signed/i);
    expect(i.selects).toHaveLength(0);
  });

  it('raid não-OPEN → recusa', async () => {
    const { d } = deps();
    const raid = await seedRaid(d);
    const leader = await d.userRepo.upsertByDiscordId({ discord_id: 'leader', username: 'leader', nickname: null, avatar: null, email: null, role: 'user' });
    await d.raidService.transition({ sub: leader.id, role: 'user' }, raid.id, 'cancel');
    const i = fakeInteraction({ customId: `hr:join:${raid.codigo}` });
    await handleJoinClick(i, d);
    expect(i.replies[0].content).toMatch(/isn't open/i);
    expect(i.selects).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && npx vitest run tests/components.test.ts`
Expected: FAIL — módulo `../src/discord/components` não existe.

- [ ] **Step 3: Criar `backend/src/discord/components.ts`** com os tipos, helpers e `handleJoinClick`:

```ts
import type { RaidService, RaidDetail } from '../modules/raids/raids.service';
import { isRaidFull } from '../modules/raids/raids.service';
import type { RaidJoinService } from '../modules/raids/raidJoin.service';
import type { UserRepo } from '../db/repositories/userRepo';
import type { PersonagemRepo } from '../db/repositories/personagemRepo';
import type { RaidBroadcaster } from '../realtime/broadcaster';
import { calcularTier } from '../common/progression/tier';
import { AppError } from '../common/errors/AppError';

export interface ComponentInteraction {
  user: { id: string; username: string };
  guildId: string | null;
  channelId: string;
  customId: string;
  values: string[];
  reply(m: { content: string; ephemeral?: boolean }): Promise<void>;
  replySelect(m: { customId: string; placeholder: string; options: { label: string; value: string }[] }): Promise<void>;
}

export type ComponentDeps = {
  raidService: RaidService;
  userRepo: UserRepo;
  personagemRepo: PersonagemRepo;
  raidJoinService: RaidJoinService;
  bus: RaidBroadcaster;
  appPublicUrl: string;
};

export function codeFromCustomId(customId: string): string {
  return customId.slice(customId.lastIndexOf(':') + 1);
}

async function actorFor(i: ComponentInteraction, deps: ComponentDeps) {
  return deps.userRepo.upsertByDiscordId({ discord_id: i.user.id, username: i.user.username, nickname: null, avatar: null, email: null, role: 'user' });
}

export async function handleJoinClick(i: ComponentInteraction, deps: ComponentDeps): Promise<void> {
  const code = codeFromCustomId(i.customId);
  let detail: RaidDetail;
  try { detail = await deps.raidService.getByCodigo(code); }
  catch { await i.reply({ content: 'Raid not found.', ephemeral: true }); return; }
  if (detail.status !== 'OPEN') { await i.reply({ content: "This raid isn't open for sign-ups.", ephemeral: true }); return; }

  const user = await actorFor(i, deps);
  if (detail.roster.some((r) => r.usuario_id === user.id)) {
    await i.reply({ content: "You're already signed up. Use **Leave** to withdraw.", ephemeral: true });
    return;
  }

  const chars = await deps.personagemRepo.findByUsuario(user.id);
  const eligible = chars.filter((c) => c.faccao === detail.faction && calcularTier(c.total_points) >= detail.minimum_tier);
  if (eligible.length === 0) {
    const reason = chars.length === 0
      ? `You don't have a character yet — create one at ${deps.appPublicUrl}`
      : `You need a ${detail.faction} character${detail.minimum_tier > 0 ? ` at Tier ${detail.minimum_tier} or higher` : ''}. Manage your characters at ${deps.appPublicUrl}`;
    await i.reply({ content: reason, ephemeral: true });
    return;
  }

  await i.replySelect({
    customId: `hr:pick:${code}`,
    placeholder: 'Pick a character',
    options: eligible.map((c) => ({
      label: `${c.nome} — ${c.role} (${c.faccao}, Tier ${calcularTier(c.total_points)})`,
      value: String(c.id),
    })),
  });
}
```

> Nota: `AppError` e `isRaidFull` são importados agora porque a Task 3 os usa (`handleCharacterPick`/`handleLeaveClick`); mantê-los aqui evita reeditar os imports. Se o linter reclamar de import não usado nesta task, ele some ao concluir a Task 3 (mesmo arquivo).

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && npx vitest run tests/components.test.ts`
Expected: PASS (6 testes de `/join (click)`).

- [ ] **Step 5: Commit**

```bash
git add backend/src/discord/components.ts backend/tests/components.test.ts
git commit -m "feat(discord): handleJoinClick (seletor de personagem elegivel + fallback web)"
```

---

### Task 3: `handleCharacterPick` + `handleLeaveClick`

**Files:**
- Modify: `backend/src/discord/components.ts`
- Test: `backend/tests/components.test.ts`

**Interfaces:**
- Consumes: `raidJoinService.join/leave` (#3), `raidService.getDetail` (#3), `isRaidFull`, `AppError` (já importados na Task 2), `codeFromCustomId`/`actorFor` (Task 2).
- Produces: `handleCharacterPick(i, deps): Promise<void>`, `handleLeaveClick(i, deps): Promise<void>`.

- [ ] **Step 1: Adicionar os imports dos handlers + testes** em `backend/tests/components.test.ts`.

Trocar a primeira linha do arquivo por (adiciona os dois handlers):

```ts
import { handleJoinClick, handleCharacterPick, handleLeaveClick, type ComponentInteraction, type ComponentDeps } from '../src/discord/components';
```

Adicionar, ao final do arquivo, um helper de preenchimento e os blocos de teste:

```ts
async function fillConfirmed(d: ComponentDeps, raidId: number, n: number) {
  for (let k = 0; k < n; k++) {
    const u = await d.userRepo.upsertByDiscordId({ discord_id: `f${k}`, username: `f${k}`, nickname: null, avatar: null, email: null, role: 'user' });
    const p = await d.personagemRepo.create({ usuario_id: u.id, nome: `F${k}`, faccao: 'Republic', classe: 'X', especializacao: null, role: 'DPS', origin_story: null, item_level: 300 } as any);
    await d.raidJoinService.join(u.id, raidId, p.id);
  }
}

describe('/pick (escolha de personagem)', () => {
  it('char elegível → inscreve confirmado e emite playerJoined', async () => {
    const { d, events } = deps();
    const raid = await seedRaid(d);
    const { p } = await giveChar(d, 'd1');
    const i = fakeInteraction({ customId: `hr:pick:${raid.codigo}`, values: [String(p.id)] });
    await handleCharacterPick(i, d);
    expect(i.replies[0].content).toMatch(/confirmed/i);
    expect(events).toContain('playerJoined');
    expect((await d.raidService.getDetail(raid.id)).roster).toHaveLength(1);
  });

  it('escolha que enche a raid → também emite raidFull', async () => {
    const { d, events } = deps();
    const raid = await seedRaid(d);
    await fillConfirmed(d, raid.id, 7);
    const { p } = await giveChar(d, 'd1');
    const i = fakeInteraction({ customId: `hr:pick:${raid.codigo}`, values: [String(p.id)] });
    await handleCharacterPick(i, d);
    expect(events).toContain('raidFull');
  });

  it('raid cheia → vai para a waitlist', async () => {
    const { d } = deps();
    const raid = await seedRaid(d);
    await fillConfirmed(d, raid.id, 8);
    const { p } = await giveChar(d, 'd1');
    const i = fakeInteraction({ customId: `hr:pick:${raid.codigo}`, values: [String(p.id)] });
    await handleCharacterPick(i, d);
    expect(i.replies[0].content).toMatch(/waitlist/i);
  });
});

describe('/leave (click)', () => {
  it('inscrito → sai e emite playerLeft', async () => {
    const { d, events } = deps();
    const raid = await seedRaid(d);
    const { u, p } = await giveChar(d, 'd1');
    await d.raidJoinService.join(u.id, raid.id, p.id);
    const i = fakeInteraction({ customId: `hr:leave:${raid.codigo}` });
    await handleLeaveClick(i, d);
    expect(i.replies[0].content).toMatch(/left the raid/i);
    expect(events).toContain('playerLeft');
    expect((await d.raidService.getDetail(raid.id)).roster).toHaveLength(0);
  });

  it('não inscrito → mensagem clara', async () => {
    const { d } = deps();
    const raid = await seedRaid(d);
    const i = fakeInteraction({ customId: `hr:leave:${raid.codigo}` });
    await handleLeaveClick(i, d);
    expect(i.replies[0].content).toMatch(/weren't signed up/i);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && npx vitest run tests/components.test.ts`
Expected: FAIL — `handleCharacterPick`/`handleLeaveClick` não existem (o arquivo de teste não carrega).

- [ ] **Step 3: Implementar `handleCharacterPick` + `handleLeaveClick`** ao final de `backend/src/discord/components.ts`:

```ts
export async function handleCharacterPick(i: ComponentInteraction, deps: ComponentDeps): Promise<void> {
  const code = codeFromCustomId(i.customId);
  const personagemId = Number(i.values[0]);
  let detail: RaidDetail;
  try { detail = await deps.raidService.getByCodigo(code); }
  catch { await i.reply({ content: 'Raid not found.', ephemeral: true }); return; }

  const user = await actorFor(i, deps);
  try {
    const result = await deps.raidJoinService.join(user.id, detail.id, personagemId);
    const fresh = await deps.raidService.getDetail(detail.id);
    deps.bus.raidUpdated(fresh, 'playerJoined');
    if (result.status === 'confirmed' && isRaidFull(fresh)) deps.bus.raidUpdated(fresh, 'raidFull');
    await i.reply({
      content: result.status === 'confirmed' ? "You're signed up as **confirmed**." : "You've been added to the **waitlist**.",
      ephemeral: true,
    });
  } catch (err) {
    await i.reply({ content: joinErrorMessage(err), ephemeral: true });
  }
}

function joinErrorMessage(err: unknown): string {
  if (err instanceof AppError) {
    switch (err.statusCode) {
      case 409: return "Couldn't sign you up — you may already be in, or the raid changed.";
      case 422: return "That character can't join this raid (faction or Tier).";
      case 404: return 'Raid or character not found.';
      case 403: return 'You can only sign up your own character.';
    }
  }
  return 'Something went wrong.';
}

export async function handleLeaveClick(i: ComponentInteraction, deps: ComponentDeps): Promise<void> {
  const code = codeFromCustomId(i.customId);
  let detail: RaidDetail;
  try { detail = await deps.raidService.getByCodigo(code); }
  catch { await i.reply({ content: 'Raid not found.', ephemeral: true }); return; }

  const user = await actorFor(i, deps);
  try {
    await deps.raidJoinService.leave(user.id, detail.id);
    deps.bus.raidUpdated(await deps.raidService.getDetail(detail.id), 'playerLeft');
    await i.reply({ content: 'You left the raid.', ephemeral: true });
  } catch (err) {
    await i.reply({ content: leaveErrorMessage(err), ephemeral: true });
  }
}

function leaveErrorMessage(err: unknown): string {
  if (err instanceof AppError) {
    if (err.statusCode === 404) return "You weren't signed up.";
    if (err.statusCode === 409) return "This raid isn't open for sign-ups.";
  }
  return 'Something went wrong.';
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && npx vitest run tests/components.test.ts && npm run typecheck`
Expected: PASS (11 testes: 6 join-click + 3 pick + 2 leave); typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
git add backend/src/discord/components.ts backend/tests/components.test.ts
git commit -m "feat(discord): handleCharacterPick + handleLeaveClick (join/leave nativo)"
```

---

### Task 4: Routing dos componentes + wiring

**Files:**
- Modify: `backend/src/discord/bot.ts`
- Modify: `backend/src/server.ts`

**Interfaces:**
- Consumes: `handleJoinClick/handleLeaveClick/handleCharacterPick` + `ComponentDeps`/`ComponentInteraction` (Tasks 2-3).
- Produces: `attachBot` roteia button/select por prefixo de `customId`; `server.ts` injeta `personagemRepo`, `raidJoinService`, `appPublicUrl`.

> Verificado por **build** + suíte; a interação ao vivo é **smoke manual** (bot token).

- [ ] **Step 1: Imports em `backend/src/discord/bot.ts`** — na linha 1, adicionar os builders/tipos de componente do discord.js:

```ts
import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits, Events, StringSelectMenuBuilder, ActionRowBuilder, type ChatInputCommandInteraction, type ButtonInteraction, type StringSelectMenuInteraction } from 'discord.js';
```

E adicionar o import dos handlers de componente logo após o import de `./commands`:

```ts
import { handleJoinClick, handleLeaveClick, handleCharacterPick, type ComponentDeps, type ComponentInteraction } from './components';
```

- [ ] **Step 2: Adaptador de componente** em `backend/src/discord/bot.ts` — adicionar após a função `adapt(...)` existente:

```ts
// Adapta button/select interactions para a superfície mínima dos handlers de componente.
function adaptComponent(interaction: ButtonInteraction | StringSelectMenuInteraction): ComponentInteraction {
  return {
    user: { id: interaction.user.id, username: interaction.user.username },
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    customId: interaction.customId,
    values: interaction.isStringSelectMenu() ? interaction.values : [],
    reply: async (m) => { await interaction.reply({ content: m.content, ephemeral: m.ephemeral ?? true }); },
    replySelect: async (m) => {
      const menu = new StringSelectMenuBuilder().setCustomId(m.customId).setPlaceholder(m.placeholder)
        .addOptions(m.options.map((o) => ({ label: o.label, value: o.value })));
      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
      await interaction.reply({ content: 'Choose a character to sign up:', components: [row], ephemeral: true });
    },
  };
}
```

- [ ] **Step 3: Alterar a assinatura de `attachBot` e o roteador** em `backend/src/discord/bot.ts`.

Trocar a assinatura (o `deps` passa a ser também `ComponentDeps`):

```ts
export function attachBot(client: Client, deps: { token: string; clientId: string } & CommandDeps & ComponentDeps): void {
```

E substituir o handler `client.on(Events.InteractionCreate, ...)` inteiro por:

```ts
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        const i = adapt(interaction);
        if (interaction.commandName === 'create_raid') await handleCreateRaid(i, deps);
        else if (interaction.commandName === 'set_raid_channel') await handleSetRaidChannel(i, deps);
        else if (interaction.commandName === 'edit_raid') await handleEditRaid(i, deps);
        else if (interaction.commandName === 'report_raid') await handleReportRaid(i, deps);
      } else if (interaction.isButton() || interaction.isStringSelectMenu()) {
        const i = adaptComponent(interaction);
        if (i.customId.startsWith('hr:join:')) await handleJoinClick(i, deps);
        else if (i.customId.startsWith('hr:leave:')) await handleLeaveClick(i, deps);
        else if (i.customId.startsWith('hr:pick:')) await handleCharacterPick(i, deps);
      }
    } catch (err) {
      logger.error({ err, cmd: interaction.isCommand() ? interaction.commandName : (interaction as any).customId }, 'Discord: erro na interação');
      if (interaction.isRepliable() && !interaction.replied) {
        await interaction.reply({ content: 'Something went wrong.', ephemeral: true }).catch(() => {});
      }
    }
  });
```

- [ ] **Step 4: Injetar os novos deps no `attachBot`** em `backend/src/server.ts` — trocar a chamada (linha ~74):

```ts
if (discordClient && cfg.DISCORD_BOT_TOKEN) {
  attachBot(discordClient, { token: cfg.DISCORD_BOT_TOKEN, clientId: cfg.DISCORD_CLIENT_ID, raidService, userRepo, guildConfigRepo, bus, report: discordSync.reportTo, personagemRepo, raidJoinService, appPublicUrl: cfg.APP_PUBLIC_URL });
}
```

- [ ] **Step 5: Build + suíte inteira**

Run: `cd backend && npm run build && npm test 2>&1 | tail -3`
Expected: build exit 0; **157 testes** verdes (146 do #1–#5b + 11 novos de components).

- [ ] **Step 6: (Smoke manual — bot token) testar Join/Leave ao vivo**

Com `DISCORD_BOT_TOKEN` no `.env` e o bot num servidor com canal configurado: criar uma raid; no embed, clicar **Join** → escolher um personagem elegível → ver o embed ir a `x+1/N` em **todos** os canais e o app mostrar ao vivo; clicar **Leave** e ver reduzir; com um membro sem char elegível, clicar Join e ver o fallback com link.

- [ ] **Step 7: Commit**

```bash
git add backend/src/discord/bot.ts backend/src/server.ts
git commit -m "feat(discord): roteia botoes/select de join + wiring dos deps"
```

---

## Verificação final (Definition of Done)

- [ ] `cd backend && npm test` — toda a suíte verde (components +11; embed atualizado; #1–#5b intactos = 157).
- [ ] `cd backend && npm run build && npm run typecheck` — exit 0.
- [ ] Smoke manual (Task 4, bot token): Join no embed → seletor → embed `x+1/N` em todos os canais + app ao vivo; Leave reduz; sem char elegível → fallback com link.

---

## Self-review (cobertura do spec)

- Botões `[Join]`/`[Leave]`/`[View on web]` no embed + `customId`s `hr:join/leave/pick`: Task 1 (embed/gateway) + Task 4 (routing). ✓
- Seletor efêmero só com chars elegíveis (facção + Tier): Task 2 (`handleJoinClick`). ✓
- Fallback com motivo + link quando não há elegível / nenhum char: Task 2. ✓
- Já inscrito → recusa; raid não-OPEN → recusa: Task 2. ✓
- Pick → `join` + `playerJoined` (+ `raidFull`) + confirmado/waitlist: Task 3. ✓
- Leave → `leave` + `playerLeft`; não-inscrito → mensagem: Task 3. ✓
- Reflexo no embed/app via `bus.raidUpdated`: Tasks 3-4 (o #5a edita o embed; socket atualiza o app). ✓
- Backend-only, aditivo, #1–#5b verdes: todas. ✓
- Mensagens/labels em inglês; erros mapeados por `AppError.statusCode`: Tasks 2-3. ✓
