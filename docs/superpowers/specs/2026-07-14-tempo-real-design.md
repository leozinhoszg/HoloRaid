# RaidSync — Tempo Real (Socket.IO) — Design

- **Data:** 2026-07-14
- **Subsistema:** #4 de 10 — Tempo real
- **Depende de:** #1 Fundação & Segurança, #2 Personagens, #3 Raids
- **Status:** Aprovado no brainstorming, aguardando revisão da spec

## Contexto

Sobre o REST de raids (#3), este subsistema adiciona **atualizações ao vivo** via
Socket.IO: quem está vendo a lista de raids ou o detalhe de uma raid recebe as mudanças
(entradas/saídas, promoção da waitlist, transições de status, criação/remoção) sem
recarregar. As mutações continuam no REST — o socket é apenas o canal de tempo real.

## Decisões fixadas (brainstorming)

| Tema | Decisão |
|------|---------|
| Arquitetura | **Model A — broadcast sobre o REST.** Mutações permanecem no REST (fonte da verdade do #3). O socket só emite eventos ao vivo. Eventos cliente→servidor são só **inscrição em salas**, nunca mutação. |
| Payload | **Eventos nomeados, cada um com a raid completa** (`RaidDetail` com roster + tier). |
| Auth | Access token do #1 no handshake do socket; conexão sem token válido é recusada. |
| Wiring | O `RaidsController` (#3) chama um `RaidBroadcaster` injetado **após** cada mutação. Services do #3 ficam intocados. Broadcaster é **opcional** (default no-op) — testes do #3 seguem passando. |
| Alcance | Backend (Socket.IO) + Flutter (cliente + estado ao vivo). |

## Objetivos e critérios de sucesso

- Um cliente conectado e inscrito em `raid:{id}` recebe `playerJoined` com a raid
  atualizada quando outro usuário dá join via REST.
- Conexão sem token válido é recusada; salas isolam eventos por raid.
- A lista de raids atualiza ao vivo (create/update/remove) para quem está no lobby.
- Reconexão re-inscreve as salas e re-sincroniza via REST (nenhum estado perdido).
- Os 104 testes do #1–#3 continuam verdes.

## Fora de escopo

Evento `notification` genérico e push (#6), sincronização/publicação no Discord (#5),
presença ("quem está online"), e qualquer mutação via socket (fica no REST).

---

## Seção 1 — Arquitetura & componentes

**Integração com o servidor:** o `server.ts` passa a criar um `http.Server` a partir do
Express e anexar o Socket.IO nele (mesma porta/processo):

```
const httpServer = http.createServer(app);
const io = new Server(httpServer, { cors: { origin: CORS_ORIGINS, credentials: true } });
registerSocket(io, { verifyAccessToken });
httpServer.listen(PORT);
```

**Autenticação (`io.use`):** middleware lê `socket.handshake.auth.token`, valida com
`verifyAccessToken` (#1), anexa `socket.data.user = { sub, role }`; token ausente/inválido
→ `next(new Error('unauthorized'))` (conexão recusada).

**Salas:**
- `raid:{id}` — quem vê o detalhe de uma raid.
- `raids` — lobby (lista).
- Inscrição por eventos cliente→servidor: `subscribe:raid {id}`, `unsubscribe:raid {id}`,
  `subscribe:lobby`, `unsubscribe:lobby`. São os únicos eventos cliente→servidor.

**`RaidBroadcaster` (peça central):** interface fina que empacota o `io`:
- `raidCreated(raid: RaidDetail): void` → emite `raidCreated` para `raids`.
- `raidUpdated(detail: RaidDetail, event: string): void` → emite `event` para
  `raid:{detail.id}` **e** `raidUpdated` para `raids` (a lista reflete status/vagas).
- `raidRemoved(id: number): void` → emite `raidRemoved` (`{ id }`) para `raids` e `raid:{id}`.
- Interface `NoopBroadcaster` (default) para quando o socket não está montado (testes do #3).

**Wiring:** `createRaidsController(raidService, raidJoinService, broadcaster?)` chama o
broadcaster após cada mutação bem-sucedida:
- `create` → `raidCreated(detail)`; `duplicate` → `raidCreated(detail)`.
- `join`/`leave` → busca `getDetail(id)` fresco → `raidUpdated(detail, 'playerJoined'|'playerLeft')`.
- `update` → `raidUpdated(detail, 'raidUpdated')`.
- `start`/`finish`/`cancel` → `raidUpdated(detail, 'raidStarted'|'raidFinished'|'raidCancelled')`.
  (Como `raidUpdated(...)` já emite `raidUpdated` para o lobby, a lista atualiza o chip de
  status — a raid **não some** da lista, que mostra todos os status.)
- `remove` (DELETE) → `raidRemoved(id)`.

Os services do #3 permanecem puros (sem novas dependências).

## Seção 2 — Eventos & payloads

**Cliente → servidor (só inscrição):**

| Evento | Payload | Efeito |
|--------|---------|--------|
| `subscribe:raid` | `{ id: number }` | entra em `raid:{id}` |
| `unsubscribe:raid` | `{ id: number }` | sai de `raid:{id}` |
| `subscribe:lobby` | — | entra em `raids` |
| `unsubscribe:lobby` | — | sai de `raids` |

**Servidor → cliente** — payload `{ raid: RaidDetail }` (exceto `raidRemoved`):

| Evento | Sala | Gatilho |
|--------|------|---------|
| `playerJoined` | `raid:{id}` | `POST /raids/:id/join` |
| `playerLeft` | `raid:{id}` | `DELETE /raids/:id/leave` (inclui promoção FIFO no roster) |
| `raidUpdated` | `raid:{id}` e `raids` | `PATCH /raids/:id` |
| `raidStarted` / `raidFinished` / `raidCancelled` | `raid:{id}` | transições |
| `raidCreated` | `raids` | `POST /raids`, `POST /raids/:id/duplicate` |
| `raidRemoved` (`{ id }`) | `raids`, `raid:{id}` | `DELETE /raids/:id` |

> Finish/cancel **não** removem da lista: emitem `raidUpdated` (o chip de status muda). A
> lista do #3 mostra todos os status.

O `waitlistUpdated` do context é coberto por `playerJoined`/`playerLeft` (a raid completa
já reflete a waitlist e a promoção). Namespace padrão (`/`).

## Seção 3 — Camada Flutter

**Dependência nova:** `socket_io_client`.

**`SocketService`** (provider singleton): conecta ao `API_BASE_URL` com o access token no
handshake (`auth: { token }`); métodos `subscribeRaid(id)`/`unsubscribeRaid(id)`/
`subscribeLobby()`/`unsubscribeLobby()`; expõe `Stream<RaidEvent>` (`RaidEvent { name, raid }`).
Trata **reconexão** do socket.io_client: ao reconectar, re-inscreve as salas ativas e
emite um sinal de resync.

**Providers (de `FutureProvider` → `AsyncNotifier`):**
- `raidDetailProvider(id)` — `AsyncNotifier.family`: `build()` faz o GET inicial, chama
  `subscribeRaid(id)` e escuta o stream filtrado por `id`; cada evento **substitui** o
  estado pela `raid` do payload; `raidRemoved` → estado "removida". `dispose` →
  `unsubscribeRaid(id)`. As telas do #3 seguem usando `.when(...)`.
- `raidsListProvider` — `AsyncNotifier`: GET inicial da lista + `subscribeLobby()`; aplica
  `raidCreated` (insere no topo/ordenado), `raidUpdated` (substitui na lista),
  `raidRemoved` (remove). `dispose` → `unsubscribeLobby()`.

**Resync:** ao (re)montar a tela ou reconectar o socket, o provider re-busca via REST — o
socket é otimização; o REST é a rede de segurança contra eventos perdidos offline.

**Telas do #3:** `RaidsListScreen` e `RaidDetailScreen` trocam `raidsProvider(null)` /
`raidProvider(id)` pelos novos `raidsListProvider` / `raidDetailProvider(id)` — a API de
consumo (`.when`) é a mesma; ajustes de `invalidate/refresh` viram chamadas ao notifier.

## Seção 4 — Segurança & testes

**Segurança:** conexão exige access token válido (mesmo JWT do #1). O socket não expõe
nada além do que o REST já expõe (rosters são visíveis a autenticados). Salas por raid
isolam eventos. CORS do Socket.IO alinhado ao `CORS_ORIGINS`.

**Testes:**
- **Broadcaster (unit):** com um `io` falso (grava `to(room).emit(name,payload)`),
  `raidUpdated(detail,'playerJoined')` emite para `raid:{id}` com nome/payload corretos;
  `raidCreated`/`raidRemoved` vão para `raids`.
- **Integração socket (ponta a ponta):** `http.Server` real com `io` + app (fakes de
  raid); `socket.io-client` conecta com token válido (aceita) e inválido (**recusa**);
  inscreve em `raid:{id}`; dispara `POST /raids/:id/join` via REST e assert que o socket
  recebeu `playerJoined` com a raid atualizada.
- **Isolamento:** socket inscrito em `raid:1` não recebe evento de `raid:2`.
- **Regressão:** os 104 testes do #1–#3 seguem verdes (broadcaster opcional no controller).

## Dependências

Backend: `socket.io`; dev `socket.io-client` (para os testes de integração). Flutter:
`socket_io_client`.

## Riscos e questões em aberto

- **Ordem dos eventos vs REST:** o cliente que fez a mutação recebe a resposta REST **e** o
  evento do socket (eco). Como ambos carregam a raid completa e o estado é idempotente
  (substituição), o eco é inofensivo.
- **`getDetail` extra no join/leave:** o controller faz um GET a mais para montar o payload
  — custo baixo e aceitável; mantém os services puros.
- **Autorização de sala:** qualquer autenticado pode `subscribe:raid` de qualquer id (os
  dados já são visíveis via REST). Sem restrição adicional no #4.

## Próximo passo

Transicionar para `writing-plans` e gerar o plano faseado (broadcaster → socket server +
auth → wiring no controller → integração → Flutter SocketService + providers).

---

## Apêndice — Contratos TypeScript (referência)

```ts
// RaidDetail vem do #3 (raids.service.ts): RaidRecord + { roster: (RosterRow & { tier })[] }

export interface RaidBroadcaster {
  raidCreated(raid: RaidDetail): void;
  raidUpdated(detail: RaidDetail, event: string): void;
  raidRemoved(id: number): void;
}

// Eventos servidor→cliente (nomes): 'playerJoined' | 'playerLeft' | 'raidUpdated'
//   | 'raidStarted' | 'raidFinished' | 'raidCancelled' | 'raidCreated' | 'raidRemoved'
// Eventos cliente→servidor: 'subscribe:raid' | 'unsubscribe:raid'
//   | 'subscribe:lobby' | 'unsubscribe:lobby'
```
