# HoloRaid — Discord Bot: /edit_raid + /report_raid (#5b) — Design

- **Data:** 2026-07-14
- **Subsistema:** #5b (segunda fatia do #5 — Discord)
- **Depende de:** #1–#4 e **#5a** (fundação do bot: gateway, DiscordSync, event bus, embed, `raid_discord_messages`, `guild_config`).
- **Status:** Aprovado no brainstorming, aguardando revisão da spec

## Contexto

A #5a entregou a fundação do bot (multi-servidor, `/create_raid`, `/set_raid_channel`,
posting/edição via `DiscordSync` + `RaidEventBus`, rastreio de mensagens em
`raid_discord_messages`). O #5b adiciona **dois comandos** que reusam quase toda essa
infra: `/edit_raid` (editar uma raid pelo Discord) e `/report_raid` (repostar o embed de
uma raid em outro canal/servidor — cross-server).

## Decisões fixadas (brainstorming)

| Tema | Decisão |
|------|---------|
| Alcance | **Backend-only** (dois handlers + defs de comando + um método no DiscordSync). Sem Flutter (o app já edita raids pela web do #3). |
| `/edit_raid` — campos | **Só os "leves"** (iguais à web/#3): `minimum_tier`, `notes`, `date`+`time`→`start_at`, `check_composition`, `slots_tank/heal/dps`. Estruturais (operation/difficulty/size/faction) **não** são editáveis. |
| `/edit_raid` — auth/regras | Reusa `raidService.update`: só **OPEN**, só **líder/admin**, vagas **não abaixo dos confirmados**. Emite `raidUpdated` no bus. |
| `/report_raid` — quem | **Qualquer membro** do servidor. |
| `/report_raid` — status | Só raids **OPEN** (o ponto é recrutar). |
| `/report_raid` — idempotência | **Por canal**: já reportada naquele canal → não duplica (UNIQUE `raid_id, channel_id`). |
| Erros | Mapeados para **inglês** pelo status HTTP da `AppError` (403/404/409/422). |

## Objetivos e critérios de sucesso

- Líder edita uma raid por `/edit_raid` e o embed atualiza em **todos** os canais + app ao vivo.
- Qualquer membro reposta uma raid OPEN por `/report_raid` no canal atual (de qualquer
  servidor), sem duplicar; a nova mensagem passa a ser **auto-editada** pelo #5a.
- Não-líder editando → recusado; raid não-OPEN → recusado; código inexistente → mensagem clara.
- Os 133 testes do #1–#5a seguem verdes (mudanças aditivas; `CommandDeps.report` opcional).

## Fora de escopo

Join nativo no Discord (#5c), seletor/menção de cargos (#5d), push (#6), i18n do app
(ciclo próprio). Editar campos estruturais.

---

## Seção 1 — Comandos & regras

**`/edit_raid`** — opções: `code` (string, obrigatório) + opcionais `minimum_tier` (int
0-6), `notes` (string), `date` (YYYY-MM-DD), `time` (HH:MM), `check_composition` (bool),
`slots_tank`/`slots_heal`/`slots_dps` (int).
1. Resolve a raid por `getByCodigo(code)`; não achou → "Raid not found."
2. Monta um **patch** só com os campos informados. `date`+`time` → `start_at` (UTC); se só
   um dos dois vier → "Provide both date and time." Valida o patch com `raidUpdateSchema`
   (#3); inválido → "Invalid values."
3. Mapeia o usuário (`upsertByDiscordId`) → `actor`. Chama `raidService.update(actor,
   detail.id, patch)` (força OPEN + líder/admin + vagas ≥ confirmados) → `bus.raidUpdated(
   detail, 'raidUpdated')` → resposta efêmera "Raid updated."
4. Mapeamento de erro por `AppError.statusCode`: 403 → "You can only edit your own raids.";
   409 → "This raid can no longer be edited."; 422 → "Invalid values. Check the fields.";
   404 → "Raid not found."; outro → "Something went wrong."

**`/report_raid`** — opção: `code` (string, obrigatório).
1. Precisa de servidor (`guildId`/`channelId`); em DM → "Use this in a server."
2. Resolve por `getByCodigo`; não achou → "Raid not found."
3. **Só OPEN**: senão → "This raid isn't open for sign-ups."
4. Chama `report(detail, guildId, channelId)`:
   - `'exists'` (já há ref para o canal) → "This raid is already posted in this channel."
   - `'posted'` → "Reported in this channel. ✅"
   - `'failed'` (erro do Discord) → "Couldn't post here — check my permissions."
5. Ao postar, grava `raid_discord_messages(raid_id, guild_id, channel_id, message_id)` → a
   auto-edição do #5a passa a incluir esse canal.

## Seção 2 — Mudanças no código

Backend, aditivo (nenhuma migration, nenhum repo novo, nada do #1–#4 tocado):

- **`discord/discordSync.ts`** — `createDiscordSyncCore` ganha
  `reportTo(detail, guildId, channelId): Promise<'posted' | 'exists' | 'failed'>`: se
  `msgRepo.listByRaid(detail.id)` já contém o `channelId` → `'exists'`; senão
  `gateway.postEmbed` + `msgRepo.create` → `'posted'`; erro → log + `'failed'`. Aguardado
  (não fire-and-forget). `createDiscordSync` passa a retornar
  `RaidBroadcaster & { reportTo: ... }` (o bus continua usando só os 3 métodos).
- **`discord/commands.ts`** — `handleEditRaid` e `handleReportRaid`. `CommandDeps` ganha
  `report?: (detail: RaidDetail, guildId: string, channelId: string) => Promise<'posted'|'exists'|'failed'>`
  (**opcional** — não quebra o #5a).
- **`discord/bot.ts`** — `buildCommandDefs` adiciona `edit_raid` e `report_raid`
  (SlashCommandBuilder); o roteador de `interactionCreate` despacha os dois novos nomes.
- **`server.ts`** — passa `report: discordSync.reportTo` no `attachBot(...)`.

## Seção 3 — Testes

Reusa `fakeGateway`, repos falsos e `fakeInteraction` do #5a:
- **`reportTo` (unit, `discordSync.test.ts`):** canal novo → `'posted'` + 1 ref gravada;
  canal repetido → `'exists'` sem duplicar; gateway falha → `'failed'` e nenhuma ref nova.
- **`handleEditRaid` (unit):** edita campos leves e emite `raidUpdated`; `code` inexistente
  → "not found"; não-líder → 403 mapeado; raid não-OPEN → 409 mapeado; `date` sem `time` →
  erro de validação.
- **`handleReportRaid` (unit):** raid OPEN + canal novo → chama `report` e responde
  "reported"; `report` → `'exists'` → "already posted"; raid não-OPEN → recusa; `report` →
  `'failed'` → mensagem de permissão.
- **Regressão:** 133 testes do #1–#5a verdes.
- **Smoke manual (bot token):** `/edit_raid` altera o embed em todos os canais; `/report_raid`
  num canal de outro servidor faz a raid aparecer e passar a ser auto-editada.

## Dependências

Nenhuma nova (reusa discord.js do #5a).

## Riscos e questões em aberto

- **`/edit_raid` com `date`/`time` em UTC** — mesma limitação do `/create_raid` (#5a); o
  embed mostra `<t:>` localizado, então o usuário confere. Melhoria futura possível.
- **`report` só quando o bot está ativo** — sem `DISCORD_BOT_TOKEN` não há comandos, então
  `report` nunca é chamado; `CommandDeps.report` opcional cobre o caso com segurança.
- **Raid reportada e depois finalizada/cancelada** — o `raidRemoved`/status do #5a já
  edita/limpa todas as refs, incluindo as reportadas.

## Próximo passo

Transicionar para `writing-plans` e gerar o plano (reportTo → handlers → command defs +
routing → wiring).

---

## Apêndice — Contratos (referência)

```ts
// Reusa do #5a: RaidDetail (#3), RaidBroadcaster, buildRaidEmbed, DiscordGateway,
//   GuildConfigRepo, RaidDiscordMessageRepo, CommandInteraction, CommandDeps.

// DiscordSync core ganha:
reportTo(detail: RaidDetail, guildId: string, channelId: string): Promise<'posted' | 'exists' | 'failed'>

// CommandDeps ganha (opcional):
report?: (detail: RaidDetail, guildId: string, channelId: string) => Promise<'posted' | 'exists' | 'failed'>

// Novos handlers:
handleEditRaid(i: CommandInteraction, deps: CommandDeps): Promise<void>
handleReportRaid(i: CommandInteraction, deps: CommandDeps): Promise<void>

// Slash commands novos: 'edit_raid' (code + campos leves opcionais), 'report_raid' (code)
```
