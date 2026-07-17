# HoloRaid — Notificação por DM do Discord (#6b) — Design

- **Data:** 2026-07-17
- **Subsistema:** #6b (segunda fatia do #6 — Notificações)
- **Depende de:** **#6** (`NotificationService`, `PushMessage`, os 3 eventos, o agendador, `usuarios.push_enabled`) e **#5a** (o bot: `Client` discord.js, `attachBot`, gateway opcional por `DISCORD_BOT_TOKEN`). Reusa `usuarios.discord_id` (#1).
- **Status:** Aprovado no brainstorming, aguardando revisão da spec

## Contexto

O #6 entregou o backend de push (FCM, Android + Web) completo e testado, mas ele está
**inerte**: depende do dono configurar o Firebase **e** da Task 8 (Flutter) registrar tokens.
Enquanto isso, `device_tokens` fica vazia e nenhuma notificação sai.

Ao revisar, ficou claro que o FCM tem um limite que não é de custo (o FCM é gratuito e
ilimitado) nem de setup, mas de **alcance**: ele só chega em quem **instalou o app, abriu e
autorizou** a notificação.

**O argumento que decidiu:** o **#5c existe precisamente para o jogador nunca precisar abrir o
app** — ele vê o embed, clica em Join, escolhe o personagem e entra na raid, tudo dentro do
Discord. Exigir que essa mesma pessoa instale o app só para ser notificada contradiz a aposta
do próprio produto. **O canal de entrega não pode exigir mais engajamento do que o produto
exige para participar.**

A DM do bot alcança quem já está no servidor, hoje, sem setup nenhum do dono — e ainda cobre
**Windows**, que o FCM nunca cobriria (o `firebase_messaging` não suporta Flutter Windows).

O #6b **não remove nada** do #6: o FCM fica mergeado, inerte e sem custo, pronto para ser
ligado se o app ganhar público.

## Decisões fixadas (brainstorming)

| Tema | Decisão |
|------|---------|
| Canal | **DM do bot** (`user.send`), reusando o `Client` do #5a. |
| Eventos | **Os mesmos 3 do #6**, sem alteração: `slotConfirmed`, `raidCancelled`, `raidStarting`. |
| Duplicidade | **DM é fallback**: tem token FCM → recebe push; **não** tem → recebe DM. Conjuntos disjuntos por construção → **impossível duplicar**. |
| Destinatário | `usuarios.discord_id`, que o `userRepo.findByIds` **já devolve** no ponto exato onde hoje buscamos os device tokens. **Sem tabela, sem repo, sem registro de aparelho.** |
| Preferência | Reusa `usuarios.push_enabled` — **um** switch governa os dois canais. |
| Formato | **Embed** enxuto: `title` (= o do push) como link clicável para `{appPublicUrl}/r/{codigo}`, `description` = o `body`. Em inglês, como todo o Discord. |
| Config | Sem `DISCORD_BOT_TOKEN` → `noopDmGateway`. `dmGateway` é **opcional** no `Deps` (default no-op), então nenhum teste do #6 muda. Zero regressão (padrão do #5a). |
| Agendador | Passa a subir com `FIREBASE_SERVICE_ACCOUNT` **OU** `DISCORD_BOT_TOKEN`. |
| Resiliência | Best-effort por usuário: DM que falha é logada e **não** impede as demais. |
| Alcance no Flutter | **Nenhum.** Zero código de app. |

## Objetivos e critérios de sucesso

- Um confirmado sai da raid → o promovido **sem app** recebe uma **DM** "You're in!".
- Líder cancela → todo o roster sem app recebe DM.
- 30 min antes → o roster sem app recebe DM, **uma única vez** (idempotência do #6 intacta).
- Usuário **com** token FCM recebe push e **nenhuma** DM.
- `push_enabled = false` → silêncio nos dois canais.
- DM que falha (DMs desativadas / sem servidor em comum) é logada e não derruba as outras.
- Sem `DISCORD_BOT_TOKEN` → nada é enviado por DM; o #6 segue como está.
- Os 191 testes de #1–#6 seguem verdes.

## Fora de escopo

- Remover ou alterar o FCM (fica intacto e inerte).
- Task 8 do #6 (Flutter/registro de token) — segue pendente do Firebase.
- Novos eventos, preferência por canal, ou opt-out separado de DM.
- Detectar de antemão quem tem DM desativada (a API não permite; só falhando).
- Fila/retry de DM, i18n das mensagens.

---

## Seção 1 — Roteamento por usuário (o coração da fatia)

Hoje o `sendTo` do `NotificationService` (#6) resolve um único canal:

```ts
const users = await deps.userRepo.findByIds(userIds);
const enabled = users.filter((u) => u.push_enabled).map((u) => u.id);
const tokens = (await deps.deviceTokenRepo.listByUsuarios(enabled)).map((t) => t.token);
const { invalidTokens } = await deps.gateway.send(tokens, msg);
```

Passa a rotear **por usuário**, com os dois conjuntos disjuntos:

```ts
const users = await deps.userRepo.findByIds(userIds);
const enabled = users.filter((u) => u.push_enabled);          // UserRecord tem discord_id
if (!enabled.length) return;

const deviceTokens = await deps.deviceTokenRepo.listByUsuarios(enabled.map((u) => u.id));
const comToken = new Set(deviceTokens.map((t) => t.usuario_id));

// canal 1 — FCM para quem tem token
const tokens = deviceTokens.map((t) => t.token);
if (tokens.length) {
  const { invalidTokens } = await deps.gateway.send(tokens, msg);
  if (invalidTokens.length) await deps.deviceTokenRepo.deleteByTokens(invalidTokens);
}

// canal 2 — DM para quem NÃO tem token
const alvos = enabled.filter((u) => !comToken.has(u.id)).map((u) => u.discord_id);
if (alvos.length) await deps.dmGateway.send(alvos, msg);
```

**Por que não duplica:** `comToken` particiona `enabled` em dois conjuntos complementares. Não
há configuração a errar. Hoje, com `device_tokens` vazia, `comToken` é vazio e **todo mundo**
cai no canal 2 — que é exatamente o objetivo.

Os 3 métodos públicos (`slotConfirmed`, `raidCancelled`, `raidStarting`) **não mudam** — nem
assinatura, nem mensagem, nem o `guard` best-effort. A mudança é toda interna ao `sendTo`.

## Seção 2 — DmGateway

```ts
export interface DmGateway {
  send(discordIds: string[], msg: PushMessage): Promise<void>;
}
export const noopDmGateway: DmGateway;
export function createDiscordDmGateway(client: Client, appPublicUrl: string): DmGateway;
```

Reusa o `PushMessage` do #6 (`{ title, body, data? }`) — nenhum contrato novo de mensagem.

**O `dmGateway` é opcional no `Deps`, com default `noopDmGateway`** — seguindo o padrão que o
codebase já usa (`broadcaster: RaidBroadcaster = noopBroadcaster` no `RaidsController`).
Consequência importante: os testes do #6 que **não** passam `dmGateway` continuam se
comportando exatamente como hoje, então **nenhum teste existente muda**.

A impl real, por usuário, cada um em try/catch:

```ts
const user = await client.users.fetch(id);
await user.send({ embeds: [embed] });
```

Falha (`50007 Cannot send messages to this user` — DMs desativadas ou sem servidor em comum)
→ `logger.warn` e segue para o próximo. `send` nunca lança.

**Embed:** `setTitle(msg.title)`, `setDescription(msg.body)` e, quando há `msg.data.codigo`
(sempre há, nos 3 eventos), `setURL(`${appPublicUrl}/r/${codigo}`)` — o que torna o título
clicável direto para a raid.

## Seção 3 — Wiring

Em `server.ts`, simétrico ao `DiscordGateway` do #5a:

```ts
const dmGateway = discordClient ? createDiscordDmGateway(discordClient, cfg.APP_PUBLIC_URL) : noopDmGateway;
const notify = createNotificationService({ gateway: pushGateway, dmGateway, deviceTokenRepo, userRepo });
```

**Mudança de gatilho do agendador:** hoje é `if (cfg.FIREBASE_SERVICE_ACCOUNT)`. Passa a ser
`if (cfg.FIREBASE_SERVICE_ACCOUNT || cfg.DISCORD_BOT_TOKEN)` — senão o lembrete de "raid
iniciando" nunca dispararia por DM, que é justamente o canal que vai funcionar primeiro. O log
de boot reflete os canais ativos.

## Seção 4 — Segurança & testes

**Segurança:** a DM vai só para o `discord_id` do próprio roster — nunca broadcast, nunca
endereço vindo do cliente. Conteúdo sem dado sensível (operação, dificuldade, horário). O bot
já tem o escopo mínimo do #5a; **enviar** DM não exige intent extra (só *receber* exigiria
`DirectMessages`).

**Testes** (gateways falsos, sem tocar o Discord):
- **Fallback (unit):** usuário **sem** token → `dmGateway.send` com o `discord_id` certo, e
  `pushGateway.send` **não** chamado.
- **Preferência do FCM (unit):** usuário **com** token → push enviado e **nenhuma** DM.
- **Roster misto (unit):** um com token, um sem → exatamente 1 push + 1 DM, **sem
  sobreposição** (o do token não aparece nos alvos da DM).
- **`push_enabled=false` (unit):** silêncio nos dois canais.
- **Best-effort (unit):** `dmGateway` lançando não propaga; uma DM falhando não impede as
  outras (fake que falha só para um `discord_id`).
- **Sem bot (unit):** `noopDmGateway` → nada acontece, sem erro.
- **Embed (unit):** título, descrição e URL `holoraid.fun/r/{codigo}`.
- **Regressão:** os 191 testes de #1–#6 verdes, **sem alterar nenhum deles** — como o
  `dmGateway` é opcional com default no-op, os testes que não o passam mantêm o comportamento
  atual (inclusive o "usuário sem token → nenhum envio", que segue válido na ausência de bot).
- **Smoke manual (requer `DISCORD_BOT_TOKEN`):** entrar numa raid cheia pelo Discord, um
  confirmado sair → o promovido recebe a DM; cancelar → o roster recebe; raid a ~25 min →
  lembrete chega uma vez.

## Riscos e questões em aberto

- **Rate limit do Discord:** uma raid de 16 sem app = até 32 chamadas (`fetch` + `send`), em
  sequência. O Discord aguenta nessa ordem de grandeza, mas é o ponto que estoura primeiro se o
  público crescer. Mitigação futura (não agora): fila com espaçamento.
- **DMs desativadas / sem servidor em comum:** a pessoa simplesmente não recebe, e **não há
  como saber de antemão** — a API só responde no erro. Aceito; é o custo da escolha.
- **`users.fetch` extra:** uma chamada por destinatário. Poderia ser cacheado pelo `Client`,
  mas não vale otimizar antes de doer.
- **Percepção:** é notificação "do Discord", não "do seu app". Consciente — foi a troca aceita
  em favor do alcance.

## Próximo passo

Transicionar para `writing-plans` e gerar o plano (DmGateway + fake → roteamento no
`NotificationService` → impl discord.js + embed → wiring/agendador no `server.ts`).

---

## Apêndice — Contratos (referência)

```ts
// Reusa do #6: PushMessage { title, body, data? }, NotificationService (3 métodos, inalterados),
//   UserRecord { id, discord_id, push_enabled, ... }, DeviceTokenRepo, RaidDetail.

// Novo (push/dmGateway.ts):
export interface DmGateway {
  send(discordIds: string[], msg: PushMessage): Promise<void>; // nunca lança
}
export const noopDmGateway: DmGateway;
export function createDiscordDmGateway(client: Client, appPublicUrl: string): DmGateway;

// Alterado (push/notification.service.ts): Deps ganha (OPCIONAL, default noopDmGateway —
// padrão do `broadcaster = noopBroadcaster`; mantém os testes do #6 intactos)
dmGateway?: DmGateway

// Alterado (server.ts): agendador sobe com
if (cfg.FIREBASE_SERVICE_ACCOUNT || cfg.DISCORD_BOT_TOKEN) startScheduler(...)
```
