# HoloRaid — Discord Bot: Controle de menções (#5d) — Design

- **Data:** 2026-07-16
- **Subsistema:** #5d (quarta fatia do #5 — Discord)
- **Depende de:** #1–#4, **#5a** (fundação: gateway, DiscordSync, event bus, embed, `guild_config`, `raid_discord_messages`), **#5b** (edit/report) e **#5c** (join nativo).
- **Status:** Aprovado no brainstorming, aguardando revisão da spec

## Contexto

O #5 previa uma fatia "#5d — Seletor de Required Discord Roles no Flutter + menção de
cargos no post", inspirada em bots de referência cujo `/create_raid` tem a opção
`required_roles` ("The roles a user must have to join the raid **from the current
server**") e `disable_mentions`.

Durante o brainstorming, decidimos **dropar o "Required Discord Roles"**. Motivos:

- **É um conceito single-server.** No bot de referência a raid vive em **um** servidor, e o
  gate usa os cargos daquele servidor. No HoloRaid a raid é criada no **app/web** e
  transmitida (broadcast) para **vários** servidores — não existe "servidor atual". Um cargo
  do servidor A não existe no servidor B; um gate cross-server é incoerente.
- **No join pela web não há servidor nenhum**, então o gate não teria como ser aplicado.
- O propósito real é **notificar, não bloquear** (decisão do dono).
- O "role" que importa para composição/join é a **role de raid (Tank/Healer/DPS)**, que já
  faz parte do personagem (#2: `personagens.role`) e já preenche a composição no join
  (#3/#5c). Não é cargo do Discord.

Sobra, então, apenas o lado de **menção/notificação**, que mapeia bem no multi-servidor:
avisar o pessoal quando a raid é postada, com um botão de desligar por raid. É isso que o
#5d entrega.

## Decisões fixadas (brainstorming)

| Tema | Decisão |
|------|---------|
| Escopo | **Dropar** o seletor/gate de "Required Discord Roles". Entregar só **controle de menções**. |
| Ping | No **post inicial** de cada servidor, o bot manda `@here` (avisa quem está online). Fixo — **sem** cargo configurável nesta fatia (fast-follow se necessário). |
| Desligar | `disable_mentions` **por raid** (boolean, default `false` = pinga). Vem do form do app **e** do `/create_raid`. Suprime o ping do post inicial. |
| Só o inicial pinga | Edições (join/saída/status) e a mensagem "raid full" **não** pingam. Editar mensagem no Discord não re-notifica; reforçamos com `allowedMentions` vazio nas edições. |
| Persistência | `disable_mentions` é coluna em `raids` — a raid é criada no app e postada depois, assíncrono, no `DiscordSync`; o flag precisa viajar com a raid. |
| Alcance | Backend (migration + schema + service + DiscordSync + gateway + comando) + **um toque no Flutter** (um switch no form de criar raid). |
| `/edit_raid` | **Não** ganha `disable_mentions` — o ping é só do post inicial; editar depois não faz sentido (igual ao bot de referência). |

## Objetivos e critérios de sucesso

- Ao postar uma raid, cada servidor recebe a mensagem com `@here` acima do embed (a menos
  que a raid tenha `disable_mentions`).
- Criar a raid com "Disable mentions" ligado (no app ou no `/create_raid`) → o post inicial
  **não** pinga ninguém.
- Join/saída/status e "raid full" nunca disparam ping novo.
- Sem `DISCORD_BOT_TOKEN` (bot off) → nada muda; zero regressão.
- Os 157 testes do #1–#5c seguem verdes (mudança aditiva).

## Fora de escopo

- **Seletor/gate de cargos do Discord** (dropado — ver Contexto).
- **Cargo de ping configurável por servidor** (coluna `mention` no `guild_config` + opção no
  `/set_raid_channel`) — fast-follow, não entra aqui.
- **Tela no app para ver/gerenciar em quais servidores o bot está** — fatia própria e maior
  (descoberta de guilds via OAuth scope `guilds` + endpoints).
- Pingar em edições ou na mensagem "raid full".
- Push notifications (#6), i18n do app (ciclo próprio).

---

## Seção 1 — Dados

Migration `005_raid_mentions.ts` (aditiva):

```sql
ALTER TABLE raids
  ADD COLUMN disable_mentions BOOLEAN NOT NULL DEFAULT false;
```

`down`: `DROP COLUMN disable_mentions`. Não afeta raids existentes (default `false` = comportamento atual, mas agora com `@here`).

## Seção 2 — Backend

- **`raids.schemas.ts` (#3):** `raidCreateSchema` ganha `disable_mentions: z.boolean().optional().default(false)`.
- **`raids.service.ts`:** `create` persiste `disable_mentions`; a linha e o `RaidDetail`
  passam a expor o campo (para o `DiscordSync` ler no post).
- **`raidRepo.ts`:** `insert`/`getDetail` incluem a coluna nova.
- **`DiscordSync.raidCreated(detail)`:** para cada `guild_config`, ao postar o embed inicial,
  monta a menção:
  - `detail.disable_mentions === false` → `content: '@here'`, `allowedMentions: { parse: ['everyone'] }` (`@here`/`@everyone` caem no parse `everyone` do discord.js).
  - `detail.disable_mentions === true` → sem `content`, `allowedMentions: { parse: [] }`.
- **`DiscordSync.raidUpdated` / mensagem "raid full":** continuam **sem** ping. As edições do
  embed usam `editEmbed` (inalterado); a mensagem "raid full" é postada com
  `allowedMentions: { parse: [] }`.
- **`DiscordGateway.postEmbed`:** assinatura ganha um parâmetro opcional
  `opts?: { content?: string; allowedMentions?: AllowedMentions }`. O adapter real (discord.js)
  repassa a `channel.send({ embeds, components, content, allowedMentions })`. `editEmbed`,
  `deleteMessage`, `postMessage` inalterados (`postMessage` da "raid full" passa
  `allowedMentions: { parse: [] }`).

## Seção 3 — Flutter

No form de criar raid: um `SwitchListTile` **"Disable mentions"** (default `false`), cujo
valor entra no payload de criação (`disable_mentions`). Nenhuma outra mudança no app —
join/estado ao vivo já vêm do socket.

## Seção 4 — Comando `/create_raid`

Adiciona a opção booleana **`disable_mentions`** (default `false`, descrição em inglês:
"Prevent the bot from pinging @here in the initial message. Default = false"), repassada ao
`raidService.create`. `/edit_raid` **não** muda.

## Seção 5 — Segurança & testes

**Segurança:** `@here` é um ping amplo, mas é **opt-out por raid** e só no post inicial —
sem escalonamento de menção (`@everyone`/roles arbitrários) e sem pingar em cada
edição/join, evitando spam. `allowedMentions` explícito garante que edições nunca notifiquem.

**Testes** (fakes, sem tocar o Discord real):
- **Schema (unit):** `raidCreateSchema` aceita `disable_mentions`; default `false` quando ausente.
- **Service (unit, fakes):** `create` persiste `disable_mentions`; `getDetail` o expõe.
- **DiscordSync (unit, gateway falso que grava `content`/`allowedMentions`):**
  - `raidCreated` com `disable_mentions=false` → post inicial em cada guild com `content='@here'`
    e `allowedMentions.parse=['everyone']`.
  - `raidCreated` com `disable_mentions=true` → sem `content` e `allowedMentions.parse=[]`.
  - `raidUpdated`/"raid full" → nunca com ping.
- **Comando (unit, interação falsa):** `/create_raid` com `disable_mentions=true` → passa o
  flag ao `create`; ausente → `false`.
- **Regressão:** 157 testes do #1–#5c verdes.
- **Smoke manual (bot token):** postar uma raid → `@here` aparece acima do embed; postar com
  "Disable mentions" → sem ping; dar join/leave → embed atualiza sem novo ping.

## Dependências

Nenhuma nova (reusa discord.js do #5a; `AllowedMentions` já vem do pacote). Migration nova
sobre o mysql2 já instalado.

## Riscos e questões em aberto

- **`@here` só notifica membros online** — é intencional (aviso leve). Um cargo dedicado
  (`@Raid Team`) notificaria offline também; fica como fast-follow configurável por servidor.
- **Percepção de spam:** mitigado por pingar só no post inicial e ser opt-out por raid.
- **Sem bot token:** sem `DISCORD_BOT_TOKEN` nada é postado/pingado; zero regressão
  (igual #5a–#5c).

## Próximo passo

Transicionar para `writing-plans` e gerar o plano faseado (migration → schema/service/repo →
gateway `content`/`allowedMentions` → DiscordSync ping no post inicial → opção no
`/create_raid` → switch no Flutter → testes).

---

## Apêndice — Contratos (referência)

```ts
// raids.schemas.ts (#3) — raidCreateSchema ganha:
disable_mentions: z.boolean().optional().default(false)

// RaidDetail (#3) ganha:
disable_mentions: boolean

// DiscordGateway.postEmbed ganha opts opcional:
postEmbed(
  channelId: string,
  embed: RaidEmbed,
  opts?: { content?: string; allowedMentions?: { parse?: ('everyone'|'roles'|'users')[]; roles?: string[]; users?: string[] } },
): Promise<string>; // message_id

// DiscordSync.raidCreated: post inicial
//   disable_mentions=false → { content: '@here', allowedMentions: { parse: ['everyone'] } }
//   disable_mentions=true  → { allowedMentions: { parse: [] } }
// raidUpdated / "raid full" → sempre allowedMentions: { parse: [] }
```
