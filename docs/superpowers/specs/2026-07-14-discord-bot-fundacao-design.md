# HoloRaid — Discord Bot: Fundação (#5a) — Design

- **Data:** 2026-07-14
- **Subsistema:** #5a (primeira fatia do #5 — Discord) de 10
- **Depende de:** #1 Fundação & Segurança, #2 Personagens, #3 Raids, #4 Tempo real
- **Status:** Aprovado no brainstorming, aguardando revisão da spec

## Contexto

O #5 (Discord) é grande e foi **decomposto** em fatias:

| Fatia | Entrega |
|-------|---------|
| **#5a (esta)** | Fundação do bot: multi-servidor, slash commands, mapeamento Discord↔app, `/create_raid` + `/set_raid_channel`, posting/edição automática do embed (broadcast), evento "raid cheia". |
| #5b | `/edit_raid` + `/report_raid` (repost cross-server). |
| #5c | "Join" nativo no Discord (seleção de personagem → join → reflete no app). |
| #5d | Seletor de "Required Discord Roles" no Flutter + menção de cargos no post. |

O app foi **rebrandeado para HoloRaid** (domínio **holoraid.fun**). O **i18n** (multi-idioma
do app) é um ciclo próprio — ver `2026-07-14-i18n-foundation-brief.md`. Nesta fatia, **os
comandos e embeds do Discord ficam em inglês** (canal é compartilhado; não há como
localizar por leitor — só o timestamp o Discord localiza sozinho).

## Decisões fixadas (brainstorming)

| Tema | Decisão |
|------|---------|
| Alcance | Predominantemente **backend** (o bot). Único toque no Flutter: parametrizar a URL de share (`AppConfig.appPublicUrl`, default `https://holoraid.fun`) + derivar o aviso "raid cheia" no estado que já chega ao vivo. |
| Bot | **Multi-servidor/público** (discord.js). **Opcional**: sem `DISCORD_BOT_TOKEN` o bot não sobe e o `DiscordSync` é no-op — o app roda 100%. |
| Comandos | Slash commands **em inglês**: `/create_raid`, `/set_raid_channel`. |
| Conta | Ao interagir, `discord_id` → `userRepo.upsertByDiscordId` (**auto-cria** conta se não existe; reusa o #1). |
| Posting | **Broadcast**: toda raid posta no canal padrão de **cada** servidor com `guild_config`. Uma raid → N mensagens (`raid_discord_messages`). Auto-edição em join/saída/status percorre todas. |
| Wiring | **Barramento de eventos** (`RaidEventBus`) — fan-out de `RaidBroadcaster`. O socket-broadcaster (#4) e o `DiscordSync` são ouvintes. Controller/router/app do #4 **não mudam**. O `/create_raid` do bot também emite no bus. |
| Raid cheia | Join **confirmado** que atinge a capacidade → evento `raidFull` → Discord posta "🔴 Raid full — starting soon!"; app deriva o aviso ao vivo. Push → #6. |
| Fuso | UTC sem ambiguidade (`timezone:'Z'` na conexão mysql2), embed com token `<t:unix:F>` (Discord localiza por leitor), app com `.toLocal()`. |
| Resiliência | Sync com Discord **best-effort e não-bloqueante**: falha é logada, nunca propaga. |

## Objetivos e critérios de sucesso

- Um dono de servidor convida o bot e roda `/set_raid_channel`; a partir daí, raids
  (criadas na web ou por `/create_raid`) são postadas naquele canal.
- Join/saída/status editam **todas** as mensagens da raid; encher dispara a mensagem
  "raid full" no Discord e o aviso no app.
- Horários aparecem no fuso de cada usuário (app e Discord).
- Bot ausente/instável nunca quebra a criação/edição de raids no app.
- #1–#4 continuam verdes.

## Fora de escopo (fatias/subsistemas futuros)

`/edit_raid`, `/report_raid` (#5b); join nativo no Discord (#5c); seletor/menção de cargos
(#5d); push notifications (#6); i18n do app (ciclo próprio).

---

## Seção 1 — Configuração & modelo de dados

**Config nova no `backend/.env`:**
- `DISCORD_BOT_TOKEN` — token do bot. **Opcional** (ausente → bot off, `DiscordSync` no-op).
- `DISCORD_CLIENT_ID` — **já existe** (OAuth #1); reusado para registrar comandos + link de convite.
- `APP_PUBLIC_URL` — default `https://holoraid.fun`; usado no botão "Join" e no share do #3.

**Modelo de dados (migration `004_discord.ts`):**
```sql
guild_config
  guild_id         VARCHAR(32) PK
  raid_channel_id  VARCHAR(32) NOT NULL
  created_at       DATETIME NOT NULL
  updated_at       DATETIME NOT NULL

raid_discord_messages
  id          BIGINT PK AUTO
  raid_id     BIGINT FK → raids(id) ON DELETE CASCADE
  guild_id    VARCHAR(32) NOT NULL
  channel_id  VARCHAR(32) NOT NULL
  message_id  VARCHAR(32) NOT NULL
  created_at  DATETIME NOT NULL
  INDEX (raid_id)
  UNIQUE (raid_id, channel_id)
```

**Fuso:** `createPool` ganha `timezone: 'Z'` (mysql2 grava/lê DATETIME como UTC). `start_at`
já é serializado como ISO UTC pelo `res.json` (Date → `...Z`). Ajuste de corretude que
também beneficia o #3.

## Seção 2 — Barramento de eventos + DiscordSync

**`RaidEventBus`** — `createRaidEventBus(...listeners: RaidBroadcaster[]): RaidBroadcaster`.
É um `RaidBroadcaster` cujos `raidCreated/raidUpdated/raidRemoved` fazem fan-out para cada
ouvinte, **cada chamada em try/catch** (ouvinte que lança não derruba os outros). Como o
controller/router/app do #4 recebem um `RaidBroadcaster`, **não mudam** — só o `server.ts`
monta o bus com `[socketBroadcaster, discordSync]`.

> `raidFull` reusa `raidUpdated(detail, 'raidFull')` (sem alterar a interface
> `RaidBroadcaster`). O socket-broadcaster emite o nome do evento à sala; o `DiscordSync`
> distingue pelo nome.

**`DiscordSync`** implementa `RaidBroadcaster`, com trabalho **assíncrono fire-and-forget**:
- `raidCreated(detail)` → lê `guild_config`; para cada, posta o embed via `DiscordGateway` e
  grava `raid_discord_messages`.
- `raidUpdated(detail, event)` → edita cada mensagem da raid com o embed regenerado; se
  `event === 'raidFull'`, **também** posta "🔴 Raid full — starting soon!" em cada canal.
- `raidRemoved(id)` → apaga (ou marca) cada mensagem e remove as refs.

Depende de `DiscordGateway` (abstração fina: `postEmbed`, `editEmbed`, `deleteMessage`,
`postMessage`), `guildConfigRepo`, `raidDiscordMessageRepo` e do construtor de embed puro.
Testável com gateway/repos falsos.

**Emissão dupla de entrada:** o bus é acionado no **controller HTTP** (#4) e também nos
**handlers do bot** (o `/create_raid` chama `raidService.create` direto e depois
`bus.raidCreated(detail)`), então uma raid criada pelo Discord também posta nos outros
servidores e aparece ao vivo no app.

**Detecção de "cheia" (no controller de join):** após o join, `detail = getDetail(id)`;
`bus.raidUpdated(detail, 'playerJoined')`; se `result.status === 'confirmed' &&
isRaidFull(detail)` → `bus.raidUpdated(detail, 'raidFull')`. `isRaidFull(detail)`: com
`check_composition`, cada role com `confirmados === slots`; senão `confirmados === size`.

## Seção 3 — Bot: comandos, mapeamento de conta e embed

**Cliente (discord.js):** `Client` com intent `Guilds`; `login(DISCORD_BOT_TOKEN)` no boot;
registra os slash commands **globalmente** (propagação ~1h). Falha de login é não-fatal.

**Mapeamento de conta:** `interaction.user.id` → `userRepo.upsertByDiscordId({ discord_id,
username, nickname:null, avatar:null, email:null, role:'user' })` — auto-cria se não existe.

**Comandos:**

| Comando | Quem | Ação |
|--------|------|------|
| `/set_raid_channel` | membro com `Manage Guild` | grava `guild_config(guild_id → canal atual)`; resposta efêmera. Sem isso, o servidor não recebe posts. Afeta só raids **futuras**. |
| `/create_raid` | qualquer membro | opções (operation/difficulty/size/faction/minimum_tier/date/time/notes; enums viram *choices*; vagas default pelo size) → valida com o `raidCreateSchema` (#3) → mapeia usuário → `raidService.create` → `bus.raidCreated(detail)` → resposta efêmera "Raid created". |

Handlers são funções que recebem uma "interação" mínima (getters de opção, `user`,
`guildId`, `memberPermissions`, `reply`) → testáveis com fakes; login/registro é smoke manual.

**Embed (construtor puro `buildRaidEmbed(detail, appPublicUrl)`, em inglês):** título
"New Raid — HoloRaid"; campos Operation · Difficulty · Size · Faction · Minimum Tier ·
Time (`<t:unix:F>`) · `confirmed/size` · Status; e botão-link **"Join"** →
`{appPublicUrl}/r/{codigo}`. (Join nativo é #5c.)

## Seção 4 — Segurança & testes

**Segurança:** `DISCORD_BOT_TOKEN` é segredo (gitignored). Link de convite com escopos
`bot` + `applications.commands` e permissões mínimas (`Send Messages`, `Embed Links`).
`/set_raid_channel` exige `Manage Guild`. Auto-criar conta é baixo risco. Best-effort:
falha do bot/Discord nunca quebra o app.

**Testes** (fakes, sem tocar o Discord real):
- **Event bus (unit):** fan-out para N ouvintes; ouvinte que lança não impede os demais.
- **`isRaidFull` (unit):** cheio por headcount, cheio por role (`check_composition`), não-cheio.
- **Embed (unit):** campos + link `holoraid.fun/r/{codigo}` + timestamp `<t:...>` do `start_at`.
- **DiscordSync (unit, gateway + repos falsos):** `raidCreated` posta em cada guild + grava
  refs; `raidUpdated` edita cada uma; `raidUpdated('raidFull')` também posta a mensagem
  "full"; `raidRemoved` apaga + limpa; um guild falhando não impede os outros.
- **Handlers (unit, interação falsa):** `/create_raid` valida + auto-cria usuário + cria +
  emite no bus + resposta efêmera; opções inválidas → erro; `/set_raid_channel` sem
  `Manage Guild` → recusa, com → grava.
- **"Cheia" (integração via supertest):** o join que enche dispara
  `raidUpdated(detail,'raidFull')` — verificado com um `RaidBroadcaster` espião passado à
  `createApp`.
- **Regressão:** #1–#4 verdes.
- **Smoke manual:** com bot token real — postar/editar num servidor, `/create_raid`, e o
  fuso renderizado.

## Dependências

Backend: `discord.js` (^14). Sem novas deps no Flutter (só a parametrização da URL). Ajuste
de `timezone:'Z'` no mysql2 (já instalado).

## Riscos e questões em aberto

- **Bot público verificado:** ≥100 servidores exige verificação do Discord. Não é problema
  no curto prazo; anotado.
- **Propagação de comandos globais** (~1h) — normal; para dev, pode-se registrar por guild.
- **`timezone:'Z'`** muda a interpretação de DATETIME já gravados no dev — como o banco é de
  desenvolvimento, aceitável; instalações novas ficam corretas.
- **`/set_raid_channel` não re-posta raids abertas** já existentes (só futuras) — repost
  retroativo é candidato a `/report_raid` no #5b.

## Próximo passo

Transicionar para `writing-plans` e gerar o plano faseado (config/URL → migration → repos →
event bus + refactor do wiring → embed → DiscordSync → gateway + bot + comandos → detecção
"cheia" no controller → bootstrap).

---

## Apêndice — Contratos (referência)

```ts
// Reusa RaidBroadcaster (#4): { raidCreated(detail); raidUpdated(detail, event); raidRemoved(id) }
// Bus: createRaidEventBus(...listeners: RaidBroadcaster[]): RaidBroadcaster

export interface DiscordGateway {
  postEmbed(channelId: string, embed: RaidEmbed): Promise<string>; // retorna message_id
  editEmbed(channelId: string, messageId: string, embed: RaidEmbed): Promise<void>;
  deleteMessage(channelId: string, messageId: string): Promise<void>;
  postMessage(channelId: string, content: string): Promise<void>;
}

export interface RaidEmbed {
  title: string;                      // "New Raid — HoloRaid"
  fields: { name: string; value: string }[];
  joinUrl: string;                    // {APP_PUBLIC_URL}/r/{codigo}
}

// Eventos de raid (nomes) ganham 'raidFull' (via raidUpdated).
// Invite scopes: bot + applications.commands; perms: Send Messages, Embed Links.
```
