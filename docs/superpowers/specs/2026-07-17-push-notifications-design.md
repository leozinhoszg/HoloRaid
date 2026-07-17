# HoloRaid — Notificações push (#6) — Design

- **Data:** 2026-07-17
- **Subsistema:** #6 (Notificações) de ~10
- **Depende de:** #1 (auth/JWT, `usuarios`), #2 (personagens), #3 (raids, roster, waitlist), #4 (tempo real). Independe do #5 (Discord) — são canais paralelos.
- **Status:** Aprovado no brainstorming, aguardando revisão da spec

## Contexto

O dump do produto (`context..md`) pede notificações de *raid criada, raid iniciando, raid
cancelada, vaga confirmada, entrada na raid, saída da raid*, em *Android, Windows e Web*.
O brainstorming enxugou isso por dois motivos concretos.

**Plataformas — Windows fica de fora.** O `firebase_messaging` (FCM) **não suporta Flutter
Windows**. Push no Windows exigiria WNS, que depende de identidade de app na Microsoft Store
(empacotar e publicar). Android e Web são cobertos por **uma única** integração FCM (Web via
service worker). Com o app aberto no Windows o socket (#4) já atualiza ao vivo, e o Discord
(#5d) já pinga — o ganho não paga o custo. **Escopo: Android + Web.**

**Eventos — 3, não 6.** Notificamos só o que afeta a pessoa e ela perderia se ninguém
avisasse:

| Evento | Para quem | Por quê |
|--------|-----------|---------|
| **Vaga confirmada** (waitlist → confirmed) | o jogador promovido | Pessoal, boa notícia, e ele não descobre sozinho. O de maior valor. |
| **Raid cancelada** | roster inteiro | A pessoa organizou a noite em volta disso. |
| **Raid iniciando** (30 min antes) | roster inteiro | Lembrete. Único evento não-reativo → exige agendador. |

**Cortados:** *raid criada* (é exatamente o que o `@here` do #5d já faz, e vira broadcast
para todos = spam) e *entrada/saída na raid* (ruído para o líder; o embed e o socket já
mostram ao vivo).

## Decisões fixadas (brainstorming)

| Tema | Decisão |
|------|---------|
| Plataformas | **Android + Web** (uma integração FCM). Windows fora — ver Contexto. |
| Eventos | **Vaga confirmada, raid cancelada, raid iniciando (30 min antes)**. Só para o **roster** — nunca broadcast. |
| Preferências | **Um liga/desliga global** por usuário (`usuarios.push_enabled`, default `true`), com switch na `home_screen`. Sem preferência por tipo de evento. |
| Config | `FIREBASE_SERVICE_ACCOUNT` **opcional**: ausente → `PushGateway` no-op + agendador não sobe. Zero regressão (mesmo padrão do `DISCORD_BOT_TOKEN` do #5a). |
| Wiring | Push **NÃO passa pelo `RaidEventBus`** — `NotificationService` é chamado explicitamente nos 3 pontos. Ver Seção 3. |
| Agendador | `setInterval` de 60s no processo, com idempotência por coluna (`raids.starting_notified_at`). Sem fila/Redis. |
| Lead time | **30 minutos** antes do `start_at`, como constante. |
| Resiliência | Best-effort: falha do FCM é logada, nunca propaga (mesmo padrão do `DiscordSync`). |
| Tokens inválidos | O que o FCM reportar como inválido é **apagado** do banco no próprio envio. |

## Objetivos e critérios de sucesso

- Um confirmado sai da raid → o primeiro da waitlist (da role liberada, se
  `check_composition`) é promovido **e recebe push** "You're in!".
- Líder cancela a raid → todo o roster recebe push.
- 30 min antes do `start_at` de uma raid OPEN → o roster recebe push **uma única vez**
  (tick duplicado ou restart do processo não re-notificam).
- Usuário com `push_enabled = false` não recebe nada.
- Token que o FCM rejeita é removido do banco.
- Sem `FIREBASE_SERVICE_ACCOUNT` → nada é enviado, nenhum agendador sobe, app e testes
  seguem 100%.
- Os 166 testes de #1–#5d seguem verdes.

## Fora de escopo

- **Windows** (ver Contexto) e iOS (o app não tem target iOS).
- *Raid criada*, *entrada/saída na raid* (cortados — ver Contexto).
- Preferência por tipo de evento; agendamento de lembretes múltiplos (ex.: 24h + 30min).
- Handler de foreground / notificação in-app customizada — o payload `notification` faz o
  SO exibir sozinho.
- Fila de jobs (BullMQ/Redis), multi-instância do backend.
- i18n das notificações — ver Riscos.
- Deep link da notificação para a tela da raid.

---

## Seção 1 — Config e dependências

**`backend/.env`:**
- `FIREBASE_SERVICE_ACCOUNT` — o JSON da service account do Firebase **em base64**
  (uma linha só, sem quebras — evita o inferno de aspas/newlines da private key dentro do
  `.env`, e funciona igual em prod). **Opcional.** Ausente/vazio → `noopPushGateway` +
  agendador desligado.

**Dependências novas:**
- Backend: `firebase-admin` (^13).
- Flutter: `firebase_core`, `firebase_messaging`.

**Pendências manuais do dono** (sem elas o push não roda de verdade; os testes usam fake e
passam mesmo assim): criar o projeto no Firebase; baixar `google-services.json` →
`app/android/app/`; configurar o Firebase Web (`firebase-messaging-sw.js` + config em
`app/web/`); gerar a service account key → `FIREBASE_SERVICE_ACCOUNT`.

## Seção 2 — Modelo de dados (migration `006_push.ts`)

```sql
device_tokens
  id          BIGINT PK AUTO
  usuario_id  BIGINT FK → usuarios(id) ON DELETE CASCADE
  token       VARCHAR(255) NOT NULL UNIQUE
  platform    ENUM('android','web') NOT NULL
  created_at  DATETIME NOT NULL
  updated_at  DATETIME NOT NULL
  INDEX (usuario_id)

ALTER TABLE usuarios ADD COLUMN push_enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE raids    ADD COLUMN starting_notified_at DATETIME NULL;
```

`token` é **UNIQUE**: o mesmo aparelho reinstalado/trocado de conta faz upsert e o
`usuario_id` é reatribuído. `starting_notified_at` é o que dá idempotência ao lembrete.

## Seção 3 — Backend

**`PushGateway`** (abstração fina, testável sem tocar o FCM):

```ts
export type PushMessage = { title: string; body: string; data?: Record<string, string> };
export interface PushGateway {
  send(tokens: string[], msg: PushMessage): Promise<{ invalidTokens: string[] }>;
}
```
Impl real com `firebase-admin` (`sendEachForMulticast`), mapeando as respostas de erro
`messaging/registration-token-not-registered` e `messaging/invalid-argument` para
`invalidTokens`. `noopPushGateway` retorna `{ invalidTokens: [] }`.

**`NotificationService`** — 3 métodos explícitos, todos best-effort (capturam e logam, nunca
lançam):

```ts
slotConfirmed(userId: number, detail: RaidDetail): Promise<void>
raidCancelled(detail: RaidDetail): Promise<void>
raidStarting(detail: RaidDetail): Promise<void>
```
Cada um: resolve os destinatários → filtra por `push_enabled` → carrega os `device_tokens` →
monta a mensagem (**em inglês**, ver Riscos) → `gateway.send` → apaga os `invalidTokens`.
Destinatários: `slotConfirmed` → só o `userId`; os outros → todos os `usuario_id` do roster
(confirmados **e** waitlist — quem está na fila também quer saber que cancelou).

**Onde é chamado (decisão de design):** o push **não passa pelo `RaidEventBus`**. A
interface `RaidBroadcaster` é `raidUpdated(detail, event)` e **não tem onde carregar *quem*
foi promovido**; mudá-la tocaria o #4 e o #5. Então o `NotificationService` é chamado
explicitamente nos pontos onde o evento de domínio é conhecido:

| Ponto | Chamada |
|-------|---------|
| `RaidsController.leave` e `handleLeaveClick` (Discord), após `raidJoin.leave` | se houve promovido → `notify.slotConfirmed(promovido, detail)` |
| `RaidsController.transition` com `action === 'cancel'` | `notify.raidCancelled(detail)` |
| Agendador (Seção 4) | `notify.raidStarting(detail)` |

**Consequência no #3:** `raidJoin.leave(actorId, raidId)` hoje retorna `void` e promove a
waitlist internamente (`raidJoin.service.ts:57`) sem contar a ninguém. Passa a retornar
**`{ promoted?: number }`** (o `usuario_id` promovido). Mudança aditiva; os 2 callers
(controller HTTP e `discord/components.ts`) repassam ao `NotificationService`.

**Endpoints novos:**

| Rota | Auth | Ação |
|------|------|------|
| `POST /devices` | JWT | body `{ token, platform }` → upsert em `device_tokens` com o `usuario_id` do JWT. |
| `PUT /me/push` | JWT | body `{ enabled: boolean }` → grava `usuarios.push_enabled`. |

`GET /me` (do #1) passa a expor `push_enabled` para o app pintar o switch.

## Seção 4 — Agendador

`setInterval` de **60s** no `server.ts`, montado **só** quando há `FIREBASE_SERVICE_ACCOUNT`.
A cada tick:

1. `raidRepo.listStartingSoon(minutos = 30)` → raids `status='OPEN'` **e** `start_at` entre
   `agora` e `agora + 30min` **e** `starting_notified_at IS NULL`.
2. Para cada: `notify.raidStarting(detail)` → `raidRepo.markStartingNotified(id)`.

A coluna `starting_notified_at` é a idempotência: restart do processo, tick duplicado ou
sobreposição de execuções não re-notificam. O `unref()` no timer evita segurar o processo.
Uma raid criada com `start_at` já dentro da janela cai no primeiro tick — correto.

## Seção 5 — Flutter

- No boot autenticado: pede permissão (`requestPermission`), obtém o token
  (`getToken`) e faz `POST /devices` com `platform` (`android` | `web`). Escuta
  `onTokenRefresh` → re-registra.
- Payload com `notification` (title/body) → o SO/navegador exibe sozinho; sem handler de
  foreground nesta fatia.
- Switch **"Notificações"** na `home_screen` (que já é a tela de perfil — mostra avatar,
  username e papel via `loadMe()`), refletindo `push_enabled` e chamando `PUT /me/push`.
- Web: `firebase-messaging-sw.js` em `app/web/`.

## Seção 6 — Segurança & testes

**Segurança:** `FIREBASE_SERVICE_ACCOUNT` é segredo (o `.env` é gitignored) — **nunca**
commitar a service account key. `POST /devices` exige JWT e usa o `sub` do token como
`usuario_id` (o cliente não escolhe de quem é o token). Notificação vai **só** para o roster
— nunca broadcast. Conteúdo da mensagem não leva dado sensível (só operação, dificuldade e
horário).

**Testes** (gateway falso, sem tocar o FCM):
- **PushGateway falso (unit):** registra `sends`; simula `invalidTokens`.
- **NotificationService (unit, fakes):**
  - `slotConfirmed` envia só para os tokens do promovido; ninguém mais recebe.
  - `push_enabled = false` → nenhum envio.
  - Usuário sem token → nenhum envio, sem erro.
  - `invalidTokens` retornados → os tokens são apagados do repo.
  - `raidCancelled` envia para todo o roster (confirmados + waitlist).
  - Gateway lançando → erro logado, não propaga.
- **`raidJoin.leave` (unit):** retorna `{ promoted }` com o usuário certo (respeitando role
  quando `check_composition`); sem promoção → `{ promoted: undefined }`. **Regressão:** os
  testes atuais de waitlist do #3 seguem verdes.
- **Agendador (unit, relógio controlado):** raid na janela → notifica **uma vez** e marca;
  2º tick → não re-envia; raid fora da janela / não-OPEN → ignorada.
- **Rotas (supertest):** `POST /devices` sem JWT → 401; com JWT → upsert (2x o mesmo token
  não duplica); `PUT /me/push` grava e `GET /me` reflete.
- **Sem credencial:** `noopPushGateway` → nenhum envio, agendador não sobe.
- **Regressão:** 166 testes de #1–#5d verdes.
- **Smoke manual (requer Firebase):** app Android registra token → sair de uma raid cheia
  promove alguém → o aparelho recebe a notificação; cancelar → roster recebe; raid a 30 min
  → lembrete chega uma vez.

## Riscos e questões em aberto

- **Mensagens em inglês.** Como no Discord (#5a), o texto sai fixo em inglês. Diferente do
  Discord, aqui **dá** para localizar por leitor no futuro (a notificação é 1-para-1), mas
  isso depende do i18n (ciclo próprio) — anotado, não feito aqui.
- **Multi-instância.** O `setInterval` em processo assume **uma** instância do backend. Com
  duas, ambas ticariam; o `starting_notified_at` reduz o dano mas há corrida (duas leem
  `NULL` antes de qualquer `UPDATE`). Aceitável hoje; se escalar, vira job com lock.
- **Windows sem push** — decisão consciente (ver Contexto). O socket cobre o app aberto.
- **Permissão negada** (Android 13+ / navegador): o app não obtém token e simplesmente não
  recebe push. Sem tratamento especial nesta fatia.
- **`token` UNIQUE global:** se dois usuários usarem o mesmo aparelho, o último registro
  vence e o anterior deixa de receber. É o comportamento correto (um aparelho, uma conta
  ativa).

## Próximo passo

Transicionar para `writing-plans` e gerar o plano faseado (migration → repos →
`PushGateway` → `NotificationService` → `leave` retornando o promovido + wiring nos 3
pontos → endpoints → agendador → Flutter).

---

## Apêndice — Contratos (referência)

```ts
// Novo (push/gateway.ts):
export type PushMessage = { title: string; body: string; data?: Record<string, string> };
export interface PushGateway {
  send(tokens: string[], msg: PushMessage): Promise<{ invalidTokens: string[] }>;
}
export const noopPushGateway: PushGateway;

// Novo (push/notification.service.ts):
type NotificationDeps = {
  gateway: PushGateway;
  deviceTokenRepo: DeviceTokenRepo;
  userRepo: UserRepo;          // ganha findByIds / push_enabled
};
slotConfirmed(userId: number, detail: RaidDetail): Promise<void>
raidCancelled(detail: RaidDetail): Promise<void>
raidStarting(detail: RaidDetail): Promise<void>

// Novo (db/repositories/deviceTokenRepo.ts):
export type DeviceToken = { id: number; usuario_id: number; token: string; platform: 'android' | 'web' };
export interface DeviceTokenRepo {
  upsert(usuario_id: number, token: string, platform: 'android' | 'web'): Promise<void>;
  listByUsuarios(ids: number[]): Promise<DeviceToken[]>;
  deleteByTokens(tokens: string[]): Promise<void>;
}

// Alterado (#3): antes `leave(...): Promise<void>`
leave(actorId: number, raidId: number): Promise<{ promoted?: number }>

// Alterado (#1): UserRepo ganha
setPushEnabled(id: number, enabled: boolean): Promise<void>
findByIds(ids: number[]): Promise<UserRecord[]>   // p/ filtrar push_enabled em lote
// UserRecord ganha: push_enabled: boolean

// Alterado (raidRepo):
listStartingSoon(withinMinutes: number): Promise<RaidRecord[]>
markStartingNotified(id: number): Promise<void>
```
