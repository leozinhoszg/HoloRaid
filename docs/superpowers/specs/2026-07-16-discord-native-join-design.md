# HoloRaid — Discord Bot: Join nativo (#5c) — Design

- **Data:** 2026-07-16
- **Subsistema:** #5c (terceira fatia do #5 — Discord)
- **Depende de:** #1–#4, **#5a** (fundação do bot: gateway, DiscordSync, event bus, embed, `raid_discord_messages`, `guild_config`) e **#5b** (comandos edit/report).
- **Status:** Aprovado no brainstorming, aguardando revisão da spec

## Contexto

O #5a/#5b entregaram o bot multi-servidor, o embed da raid (postado/editado em cada
canal configurado) e os comandos `/create_raid`, `/set_raid_channel`, `/edit_raid`,
`/report_raid`. Hoje o embed tem **um único botão "Join" do tipo Link**, que apenas abre a
web (`joinUrl`). O #5c substitui isso por **join nativo**: o membro dá sign (ou sai) de uma
raid direto pelo Discord, sem sair para a web.

O join no #3 exige **um personagem específico**: `raidJoinService.join(actorId, raidId,
personagemId)` valida raid OPEN, personagem do próprio usuário, facção = raid.faction,
Tier ≥ `minimum_tier`, 1 sign por usuário, e retorna `confirmed`/`waitlist`. O
`raidJoinService.leave(actorId, raidId)` remove o sign e promove a waitlist. O vínculo
Discord↔conta é automático por `discord_id` (login web e bot usam a mesma chave), então quem
já criou personagens no app os enxerga no bot; quem nunca usou tem conta auto-criada **sem**
personagem.

## Decisões fixadas (brainstorming)

| Tema | Decisão |
|------|---------|
| Alcance | **Backend-only** (embed + gateway + handlers de componente + routing + wiring). Sem Flutter — o app já mostra o join ao vivo via socket (`playerJoined`). |
| Trigger | **Botões no embed**: `[Join]` (primary), `[Leave]` (secondary), `[View on web]` (link, mantém a `joinUrl`). |
| Seleção de personagem | Ao clicar Join, o bot responde (efêmero) com um **select menu** listando **apenas os personagens elegíveis** (facção = raid.faction **e** Tier ≥ `minimum_tier`). |
| Sem char elegível | Efêmero com o **motivo + link para holoraid.fun**: sem personagem nenhum → "create one"; tem chars mas nenhum elegível → explica facção/Tier. |
| Quem pode | **Qualquer membro** do servidor (consistente com o #5b). |
| Reflexo no app/embed | Reusa `raidJoinService.join`/`leave` + `bus.raidUpdated` → embed (todos os canais) e app atualizam sozinhos. |

## Objetivos e critérios de sucesso

- Membro clica **Join** no embed → escolhe um personagem elegível → fica `confirmed`/`waitlist`;
  o embed vai a `x+1/N` em **todos** os canais e o app mostra ao vivo.
- Membro clica **Leave** → sai; a waitlist promove; embed/app atualizam.
- Sem personagem elegível → mensagem clara com o motivo + link do app; nenhum sign criado.
- Já inscrito → Join recusa com instrução de usar Leave.
- Raid não-OPEN → Join/Leave recusam.
- Os 146 testes do #1–#5b seguem verdes (mudanças aditivas).

## Fora de escopo

Seletor/menção de Discord Roles (#5d), push (#6), i18n do app (ciclo próprio),
deep-link por facção para criar personagem (rota do app não existe ainda), botão de gerenciar
composição pelo Discord.

---

## Seção 1 — Fluxo de interação

O embed passa a ter três componentes numa action row. `customId`s namespaced com prefixo
`hr:`: `hr:join:<codigo>`, `hr:leave:<codigo>`, `hr:pick:<codigo>`.

**Clique em Join** (`hr:join:<codigo>`):
1. Resolve a raid por `getByCodigo(codigo)`. Não OPEN → efêmero "This raid isn't open for sign-ups."
2. Mapeia o membro por `discord_id` (`upsertByDiscordId`) → `actor`.
3. Já inscrito (`findByRaidAndUser`) → efêmero "You're already signed up. Use **Leave** to withdraw."
4. Carrega `personagemRepo.findByUsuario(actor.id)`, deriva Tier (`calcularTier(total_points)`)
   e filtra elegíveis (facção = raid.faction **e** Tier ≥ `minimum_tier`):
   - Nenhum personagem → efêmero "You don't have a character yet — create one at `<appPublicUrl>`."
   - Tem chars mas nenhum elegível → efêmero com o motivo (ex.: "You need a Republic character
     at Tier 3 or higher.") + link do app.
   - Elegíveis → `replySelect` efêmero (`hr:pick:<codigo>`), placeholder "Pick a character",
     opções = elegíveis com label `"<nome> — <role> (<fac>, Tier <n>)"` e value = `personagem_id`.

**Escolha no select** (`hr:pick:<codigo>`):
1. Resolve a raid por `getByCodigo`; mapeia o membro.
2. `raidJoinService.join(actor.id, raid.id, personagemId)` (revalida tudo do #3).
3. `bus.raidUpdated(detail, 'playerJoined')`; se `result.status === 'confirmed' && isRaidFull(detail)`
   → `bus.raidUpdated(detail, 'raidFull')`.
4. Efêmero "You're signed up as **confirmed**." / "…added to the **waitlist**."
5. Erro do serviço (ex.: raid encheu/mudou entre o clique e a escolha) → mapeia por
   `AppError.statusCode` para inglês (reusa a lógica de mapeamento, mensagens genéricas).

**Clique em Leave** (`hr:leave:<codigo>`):
1. Resolve a raid; mapeia o membro.
2. `raidJoinService.leave(actor.id, raid.id)` → `bus.raidUpdated(detail, 'playerLeft')` →
   efêmero "You left the raid."
3. Não inscrito / raid não-OPEN → o serviço lança; responde a mensagem correspondente
   ("You weren't signed up." / "This raid isn't open for sign-ups.").

## Seção 2 — Mudanças no código

Backend, aditivo (nenhuma migration, nenhum repo novo, nada do #1–#5b removido):

- **`discord/embed.ts`** — `RaidEmbed` ganha `codigo: string`; `buildRaidEmbed` preenche com
  `detail.codigo`.
- **`discord/gateway.ts`** — `render()` troca o botão Link único por uma action row com
  `[Join]` (`ButtonStyle.Primary`, `customId hr:join:<codigo>`), `[Leave]`
  (`ButtonStyle.Secondary`, `customId hr:leave:<codigo>`) e `[View on web]`
  (`ButtonStyle.Link`, `url = embed.joinUrl`). Como `render` roda em todo post/edit, os
  componentes são reanexados a cada edição do #5a (embed nunca perde os botões).
- **`discord/components.ts`** (novo) — handlers testáveis, sem discord.js:
  - Interface `ComponentInteraction` — `{ user: {id, username}; guildId: string | null;
    channelId: string; customId: string; values: string[];
    reply(m: {content: string; ephemeral?: boolean}): Promise<void>;
    replySelect(m: {customId: string; placeholder: string;
    options: {label: string; value: string}[]}): Promise<void> }`.
  - `ComponentDeps` = `{ raidService: RaidService; userRepo: UserRepo;
    personagemRepo: PersonagemRepo; raidJoinService: RaidJoinService;
    bus: RaidBroadcaster; appPublicUrl: string }`.
  - `handleJoinClick(i, deps)`, `handleCharacterPick(i, deps)`, `handleLeaveClick(i, deps)`.
  - Helper `codeFromCustomId(customId): string` (parte após o último `:`).
  - Helper de elegibilidade (facção + Tier via `calcularTier`); reusa `isRaidFull`.
- **`discord/bot.ts`** — no `client.on(Events.InteractionCreate)`, além de
  `isChatInputCommand`, tratar `interaction.isButton()` e
  `interaction.isStringSelectMenu()`: adaptar para `ComponentInteraction` e rotear por
  prefixo de `customId` (`hr:join:` → join, `hr:leave:` → leave, `hr:pick:` → pick). O
  adapter de componente implementa `reply` (`interaction.reply({..., ephemeral})`) e
  `replySelect` (monta `StringSelectMenuBuilder` numa `ActionRowBuilder`).
- **`server.ts`** — passa os novos deps no `attachBot`: `raidJoinService`, `personagemRepo`,
  `appPublicUrl: cfg.APP_PUBLIC_URL` (além dos já existentes).

`attachBot` passa a receber `ComponentDeps` além de `CommandDeps` (a assinatura de `deps`
cresce; ambos são backend puros).

## Seção 3 — Testes

Reusa repos falsos (`fakeRepos`) e o padrão de `fakeInteraction` do #5a/#5b:

- **`components.test.ts`** (novo) — com um `fakeComponentInteraction` (grava `replies` e
  `selects`) e `deps()` reusando `createRaidService`/`createRaidJoinService` + fakes:
  - Join sem personagem nenhum → `reply` com link do app; nenhum sign.
  - Join com chars mas nenhum elegível (facção errada / Tier baixo) → `reply` com motivo + link.
  - Join com elegíveis → `replySelect` com exatamente os chars elegíveis (valida label/value).
  - Já inscrito → `reply` "already signed up"; nenhum select.
  - Raid não-OPEN → Join `reply` recusa.
  - Pick de um char elegível → `join` confirmado + `playerJoined` no bus + `reply` "confirmed".
  - Pick que enche a raid → `raidFull` também emitido.
  - Pick indo para waitlist → `reply` "waitlist".
  - Leave inscrito → sai + `playerLeft` no bus + `reply` "left".
  - Leave não-inscrito → `reply` "weren't signed up".
- **`embed.test.ts`** — asserção do novo `codigo` no `RaidEmbed`.
- **Regressão:** 146 testes do #1–#5b verdes.
- **Smoke manual (bot token):** postar uma raid; clicar **Join** no embed → escolher um char
  elegível → o embed vai a `x+1/N` em todos os canais e o app mostra o join ao vivo; **Leave**
  reduz; membro sem char elegível recebe o fallback com link.

## Dependências

Nenhuma nova (reusa discord.js do #5a: `ButtonBuilder`, `StringSelectMenuBuilder`,
`ActionRowBuilder`).

## Riscos e questões em aberto

- **Race clique→escolha:** a raid pode encher/mudar entre o clique em Join e a escolha do
  char. `raidJoinService.join` revalida no momento da escolha (fonte da verdade); o erro vira
  mensagem efêmera. Sem lock — aceitável (waitlist absorve).
- **Conta auto-criada vazia:** clicar Join cria/upserta a conta por `discord_id` mesmo sem
  personagem; é inofensivo (cai no fallback web).
- **customId ≤ 100 chars:** `hr:pick:<codigo>` é curto (código de raid é pequeno). Sem risco.
- **Sem bot token:** sem `DISCORD_BOT_TOKEN` não há bot → nenhum componente é postado/roteado;
  zero regressão (igual #5a/#5b).

## Próximo passo

Transicionar para `writing-plans` e gerar o plano (embed+gateway → components handlers →
routing+adapter → wiring).

---

## Apêndice — Contratos (referência)

```ts
// Reusa: RaidDetail (#3), RaidService.getByCodigo, RaidJoinService.join/leave (#3),
//   UserRepo.upsertByDiscordId (#1), PersonagemRepo.findByUsuario (#2),
//   RaidBroadcaster (#4), isRaidFull, calcularTier, buildRaidEmbed (#5a).

// RaidEmbed ganha:
codigo: string

// Novo (discord/components.ts):
interface ComponentInteraction {
  user: { id: string; username: string };
  guildId: string | null;
  channelId: string;
  customId: string;
  values: string[];
  reply(m: { content: string; ephemeral?: boolean }): Promise<void>;
  replySelect(m: { customId: string; placeholder: string; options: { label: string; value: string }[] }): Promise<void>;
}

type ComponentDeps = {
  raidService: RaidService;
  userRepo: UserRepo;
  personagemRepo: PersonagemRepo;
  raidJoinService: RaidJoinService;
  bus: RaidBroadcaster;
  appPublicUrl: string;
};

handleJoinClick(i: ComponentInteraction, deps: ComponentDeps): Promise<void>
handleCharacterPick(i: ComponentInteraction, deps: ComponentDeps): Promise<void>
handleLeaveClick(i: ComponentInteraction, deps: ComponentDeps): Promise<void>

// customIds: hr:join:<codigo>, hr:leave:<codigo>, hr:pick:<codigo>
```
