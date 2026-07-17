# Notificação por DM do Discord (#6b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar os 3 eventos do #6 por DM do bot para quem não tem o app, reusando o `NotificationService` inteiro.

**Architecture:** Um `DmGateway` irmão do `PushGateway`. O `sendTo` do `NotificationService` passa a rotear **por usuário**: quem tem token FCM recebe push, quem não tem recebe DM — conjuntos disjuntos, impossível duplicar. O destinatário é o `discord_id`, que o `userRepo.findByIds` já devolve. Zero tabela, zero registro, zero Flutter.

**Tech Stack:** Node/TypeScript, discord.js ^14 (`Client.users.fetch` + `user.send`), vitest.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-17-discord-dm-notifications-design.md`.
- **Não remova nem altere o FCM.** O #6 fica intacto; o #6b só acrescenta um canal.
- **Os 3 métodos públicos do `NotificationService` não mudam** (`slotConfirmed`, `raidCancelled`, `raidStarting`) — nem assinatura, nem mensagem. A mudança é **interna ao `sendTo`**.
- **`dmGateway` é OPCIONAL no `Deps`, default `noopDmGateway`** (padrão do `broadcaster = noopBroadcaster`). Consequência: **nenhum teste existente do #6 muda**.
- **DM é fallback:** tem token → FCM; não tem → DM. Nunca os dois.
- **Textos em INGLÊS** (reusa o `PushMessage` do #6 sem alterar).
- **`DmGateway.send` NUNCA lança** — falha por usuário é logada e não impede os demais.
- Sem `DISCORD_BOT_TOKEN` → `noopDmGateway`, nada é enviado.
- **Regressão:** os **191 testes** de #1–#6 seguem verdes, **sem editar nenhum**.
- **Commits:** autor `Leonardo de Souza Guimarães <leozinhoszg@gmail.com>`. **NUNCA** `Co-Authored-By: Claude`.
- Backend roda em `backend/`. Testes: `npx vitest run <arquivo>`. Typecheck: `npm run typecheck` (**cheque o exit code, não use pipe**).

---

### Task 1: DmGateway (contrato + noop + fake) e roteamento por usuário

**Files:**
- Create: `backend/src/push/dmGateway.ts`
- Create: `backend/tests/fakes/fakeDm.ts`
- Modify: `backend/src/push/notification.service.ts` (`Deps` e `sendTo`)
- Test: `backend/tests/notification.test.ts`

**Interfaces:**
- Consumes: `PushMessage` (#6, `push/gateway.ts`), `UserRepo.findByIds` → `UserRecord { id, discord_id, push_enabled }` (#6), `DeviceTokenRepo.listByUsuarios` → `DeviceToken { usuario_id, token }` (#6).
- Produces:
  - `export interface DmGateway { send(discordIds: string[], msg: PushMessage): Promise<void> }`
  - `export const noopDmGateway: DmGateway`
  - `Deps` do `NotificationService` ganha `dmGateway?: DmGateway`
  - `makeFakeDmGateway(opts?: { fail?: boolean; failFor?: string[] }): DmGateway & { sends: DmSend[] }`
  - `export type DmSend = { discordIds: string[]; msg: PushMessage }`

- [ ] **Step 1: Write the failing test**

Em `backend/tests/notification.test.ts`:

**(a)** adicione o import do fake novo (junto dos outros, no topo):

```ts
import { makeFakeDmGateway } from './fakes/fakeDm';
```

**(b)** adicione um `setupDm` **novo** (não altere o `setup` existente — é ele que mantém os testes do #6 intactos), logo depois do `setup`:

```ts
async function setupDm(dmOpts: { fail?: boolean; failFor?: string[] } = {}) {
  const userRepo = makeFakeUserRepo();
  const deviceTokenRepo = makeFakeDeviceTokenRepo();
  const gateway = makeFakePushGateway();
  const dmGateway = makeFakeDmGateway(dmOpts);
  const mk = async (discord_id: string) =>
    userRepo.upsertByDiscordId({ discord_id, username: discord_id, nickname: null, avatar: null, email: null, role: 'user' });
  const notify = createNotificationService({ gateway, dmGateway, deviceTokenRepo, userRepo });
  return { notify, gateway, dmGateway, userRepo, deviceTokenRepo, mk };
}
```

**(c)** adicione o describe novo ao final do arquivo:

```ts
describe('fallback por DM (#6b)', () => {
  it('usuário SEM token → recebe DM, e nenhum push', async () => {
    const { notify, gateway, dmGateway, mk } = await setupDm();
    const a = await mk('disc-a');
    await notify.slotConfirmed(a.id, detail([{ usuario_id: a.id, status: 'confirmed' }]));

    expect(gateway.sends).toHaveLength(0);
    expect(dmGateway.sends).toHaveLength(1);
    expect(dmGateway.sends[0]!.discordIds).toEqual(['disc-a']);
    expect(dmGateway.sends[0]!.msg.title).toBe("You're in!");
  });

  it('usuário COM token → recebe push, e nenhuma DM', async () => {
    const { notify, gateway, dmGateway, deviceTokenRepo, mk } = await setupDm();
    const a = await mk('disc-a');
    await deviceTokenRepo.upsert(a.id, 'tok-a', 'android');
    await notify.slotConfirmed(a.id, detail([{ usuario_id: a.id, status: 'confirmed' }]));

    expect(gateway.sends).toHaveLength(1);
    expect(dmGateway.sends).toHaveLength(0);
  });

  it('roster misto → 1 push + 1 DM, sem sobreposição', async () => {
    const { notify, gateway, dmGateway, deviceTokenRepo, mk } = await setupDm();
    const comApp = await mk('disc-app');
    const semApp = await mk('disc-dm');
    await deviceTokenRepo.upsert(comApp.id, 'tok-app', 'android');

    await notify.raidCancelled(detail([
      { usuario_id: comApp.id, status: 'confirmed' },
      { usuario_id: semApp.id, status: 'waitlist' },
    ]));

    expect(gateway.sends).toHaveLength(1);
    expect(gateway.sends[0]!.tokens).toEqual(['tok-app']);
    expect(dmGateway.sends).toHaveLength(1);
    expect(dmGateway.sends[0]!.discordIds).toEqual(['disc-dm']); // o do app NÃO aparece aqui
  });

  it('push_enabled=false → silêncio nos dois canais', async () => {
    const { notify, gateway, dmGateway, userRepo, mk } = await setupDm();
    const a = await mk('disc-a');
    await userRepo.setPushEnabled(a.id, false);
    await notify.raidStarting(detail([{ usuario_id: a.id, status: 'confirmed' }]));

    expect(gateway.sends).toHaveLength(0);
    expect(dmGateway.sends).toHaveLength(0);
  });

  it('dmGateway lançando não propaga (best-effort)', async () => {
    const { notify, mk } = await setupDm({ fail: true });
    const a = await mk('disc-a');
    await expect(notify.raidStarting(detail([{ usuario_id: a.id, status: 'confirmed' }]))).resolves.toBeUndefined();
  });

  it('sem dmGateway (default no-op) → nada acontece, sem erro', async () => {
    const { notify, gateway, mk } = await setup(); // setup do #6, SEM dmGateway
    const a = await mk('a');
    await expect(notify.slotConfirmed(a.id, detail([{ usuario_id: a.id, status: 'confirmed' }]))).resolves.toBeUndefined();
    expect(gateway.sends).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/notification.test.ts`
Expected: FAIL — não resolve `./fakes/fakeDm`.

- [ ] **Step 3: Criar o contrato do DmGateway**

Crie `backend/src/push/dmGateway.ts`:

```ts
import type { PushMessage } from './gateway';

export interface DmGateway {
  // Nunca lança: falha por usuário é logada internamente e não impede os demais.
  send(discordIds: string[], msg: PushMessage): Promise<void>;
}

export const noopDmGateway: DmGateway = {
  async send() {},
};
```

- [ ] **Step 4: Criar o fake**

Crie `backend/tests/fakes/fakeDm.ts`:

```ts
import type { DmGateway } from '../../src/push/dmGateway';
import type { PushMessage } from '../../src/push/gateway';

export type DmSend = { discordIds: string[]; msg: PushMessage };

export function makeFakeDmGateway(opts: { fail?: boolean; failFor?: string[] } = {}): DmGateway & { sends: DmSend[] } {
  const sends: DmSend[] = [];
  return {
    sends,
    async send(discordIds, msg) {
      if (opts.fail) throw new Error('dm boom');
      // failFor simula o best-effort da impl real: quem falha é pulado, o resto recebe.
      const entregues = discordIds.filter((id) => !(opts.failFor ?? []).includes(id));
      sends.push({ discordIds: entregues, msg });
    },
  };
}
```

- [ ] **Step 5: Rotear por usuário no NotificationService**

Em `backend/src/push/notification.service.ts`:

**(a)** import e `Deps`:

```ts
import type { DmGateway } from './dmGateway';
import { noopDmGateway } from './dmGateway';
```
```ts
type Deps = { gateway: PushGateway; deviceTokenRepo: DeviceTokenRepo; userRepo: UserRepo; dmGateway?: DmGateway };
```

**(b)** substitua **todo** o corpo do `sendTo` (o resto do arquivo — `rosterIds`, `guard` e os 3 métodos — **não muda**):

```ts
export function createNotificationService(deps: Deps) {
  const dm = deps.dmGateway ?? noopDmGateway;

  // Roteia por usuário: tem token FCM -> push; não tem -> DM.
  // Os dois conjuntos são disjuntos por construção, então nunca duplica.
  async function sendTo(userIds: number[], msg: PushMessage): Promise<void> {
    if (!userIds.length) return;
    const users = await deps.userRepo.findByIds(userIds);
    const enabled = users.filter((u) => u.push_enabled);
    if (!enabled.length) return;

    const deviceTokens = await deps.deviceTokenRepo.listByUsuarios(enabled.map((u) => u.id));
    const comToken = new Set(deviceTokens.map((t) => t.usuario_id));

    // canal 1 — FCM
    const tokens = deviceTokens.map((t) => t.token);
    if (tokens.length) {
      const { invalidTokens } = await deps.gateway.send(tokens, msg);
      if (invalidTokens.length) await deps.deviceTokenRepo.deleteByTokens(invalidTokens);
    }

    // canal 2 — DM para quem não tem app
    const alvos = enabled.filter((u) => !comToken.has(u.id)).map((u) => u.discord_id);
    if (alvos.length) await dm.send(alvos, msg);
  }
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/notification.test.ts`
Expected: **13 testes PASS** (os 7 do #6 + 6 novos).

Run: `cd backend && npm run typecheck > /dev/null 2>&1; echo "EXIT=$?"`
Expected: `EXIT=0`.

- [ ] **Step 7: Regressão desta task**

Run: `cd backend && npm test`
Expected: **todos passam**. Nenhum teste do #6 foi editado — o default no-op preserva o comportamento.

- [ ] **Step 8: Commit**

```bash
git add backend/src/push/dmGateway.ts backend/src/push/notification.service.ts backend/tests/fakes/fakeDm.ts backend/tests/notification.test.ts
git commit -m "feat(push): DmGateway + roteamento FCM/DM por usuario"
```

---

### Task 2: Implementação real da DM (discord.js) + embed

**Files:**
- Modify: `backend/src/push/dmGateway.ts` (impl real + `buildDmEmbed`)
- Test: `backend/tests/dmEmbed.test.ts` (novo)

**Interfaces:**
- Consumes: `Client` (discord.js, do #5a), `PushMessage` (#6), `DmGateway` (Task 1).
- Produces:
  - `export function buildDmEmbed(msg: PushMessage, appPublicUrl: string): EmbedBuilder` — função **pura**, testável.
  - `export function createDiscordDmGateway(client: Client, appPublicUrl: string): DmGateway`

> A impl com discord.js não é testável em unit (precisaria de um `Client` real); por isso o embed é extraído como função pura e testado, e o `send` é coberto pelo smoke manual da Task 4.

- [ ] **Step 1: Write the failing test**

Crie `backend/tests/dmEmbed.test.ts`:

```ts
import { buildDmEmbed } from '../src/push/dmGateway';

describe('buildDmEmbed', () => {
  it('monta titulo, descricao e link da raid', () => {
    const e = buildDmEmbed(
      { title: "You're in!", body: 'A spot opened up.', data: { raidId: '7', codigo: 'X7', event: 'slotConfirmed' } },
      'https://holoraid.fun',
    );
    expect(e.data.title).toBe("You're in!");
    expect(e.data.description).toBe('A spot opened up.');
    expect(e.data.url).toBe('https://holoraid.fun/r/X7');
  });

  it('sem codigo → sem url (nao quebra)', () => {
    const e = buildDmEmbed({ title: 'T', body: 'B' }, 'https://holoraid.fun');
    expect(e.data.title).toBe('T');
    expect(e.data.url).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/dmEmbed.test.ts`
Expected: FAIL — `buildDmEmbed is not a function`.

- [ ] **Step 3: Implementar o embed e o gateway real**

Em `backend/src/push/dmGateway.ts`, **acrescente** (mantendo a interface e o `noopDmGateway` da Task 1):

```ts
import { EmbedBuilder, type Client } from 'discord.js';
import { logger } from '../common/logger/logger';
```

```ts
// Puro (testável): o titulo vira link direto para a raid.
export function buildDmEmbed(msg: PushMessage, appPublicUrl: string): EmbedBuilder {
  const e = new EmbedBuilder().setTitle(msg.title).setDescription(msg.body);
  const codigo = msg.data?.codigo;
  if (codigo) e.setURL(`${appPublicUrl}/r/${codigo}`);
  return e;
}

export function createDiscordDmGateway(client: Client, appPublicUrl: string): DmGateway {
  return {
    async send(discordIds, msg) {
      const embed = buildDmEmbed(msg, appPublicUrl);
      for (const id of discordIds) {
        try {
          const user = await client.users.fetch(id);
          await user.send({ embeds: [embed] });
        } catch (err) {
          // 50007 = DMs desativadas ou sem servidor em comum. Best-effort: segue para o próximo.
          logger.warn({ err, discordId: id }, 'discord: DM não entregue');
        }
      }
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/dmEmbed.test.ts`
Expected: 2 testes PASS.

Run: `cd backend && npm run typecheck > /dev/null 2>&1; echo "EXIT=$?"`
Expected: `EXIT=0`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/push/dmGateway.ts backend/tests/dmEmbed.test.ts
git commit -m "feat(push): DM real via discord.js + embed com link da raid"
```

---

### Task 3: Wiring no server + gatilho do agendador

**Files:**
- Modify: `backend/src/server.ts`

**Interfaces:**
- Consumes: `createDiscordDmGateway`/`noopDmGateway` (Tasks 1–2), `createNotificationService` (Task 1), `startScheduler` (#6).
- Produces: nada (folha).

- [ ] **Step 1: Montar o dmGateway**

Em `backend/src/server.ts`, adicione o import junto dos outros de push:

```ts
import { noopDmGateway, createDiscordDmGateway } from './push/dmGateway';
```

O `discordClient` já existe acima (`const discordClient = cfg.DISCORD_BOT_TOKEN ? createDiscordClient() : null;`). No bloco de push, monte o gateway de DM e passe ao service:

```ts
// Push opcional: sem FIREBASE_SERVICE_ACCOUNT, gateway no-op e agendador não sobe.
const deviceTokenRepo = createDeviceTokenRepo(db);
const pushGateway = cfg.FIREBASE_SERVICE_ACCOUNT ? createFcmGateway(cfg.FIREBASE_SERVICE_ACCOUNT) : noopPushGateway;
// DM opcional: reusa o Client do bot (#5a). Sem bot → no-op.
const dmGateway = discordClient ? createDiscordDmGateway(discordClient, cfg.APP_PUBLIC_URL) : noopDmGateway;
const notify = createNotificationService({ gateway: pushGateway, dmGateway, deviceTokenRepo, userRepo });
```

- [ ] **Step 2: Agendador sobe com Firebase OU bot**

Ainda em `server.ts`, substitua o bloco do agendador e o log de boot:

```ts
// O lembrete precisa do agendador em QUALQUER canal (FCM ou DM).
if (cfg.FIREBASE_SERVICE_ACCOUNT || cfg.DISCORD_BOT_TOKEN) {
  startScheduler({ raidRepo, raidService, notify });
  logger.info('Push: agendador de lembretes ativo');
}

httpServer.listen(cfg.PORT, () => logger.info(`HoloRaid backend (HTTP+Socket.IO${discordClient ? '+Discord' : ''}${cfg.FIREBASE_SERVICE_ACCOUNT ? '+Push' : ''}) ouvindo em :${cfg.PORT}`));
```

- [ ] **Step 3: Verificar typecheck e build**

Run: `cd backend && npm run typecheck > /dev/null 2>&1; echo "typecheck EXIT=$?"; npm run build > /dev/null 2>&1; echo "build EXIT=$?"`
Expected: ambos `EXIT=0`.

- [ ] **Step 4: Verificar o boot (sem bot e sem Firebase = tudo no-op)**

Run: `cd backend && (timeout 20 npx tsx src/server.ts > /tmp/srv6b.log 2>&1 &) ; sleep 12; grep -o "HoloRaid backend.*" /tmp/srv6b.log; grep -c "agendador" /tmp/srv6b.log`
Expected: log **sem** `+Discord` e **sem** `+Push`; contagem de "agendador" = **0** (nem Firebase nem bot configurados no `.env` atual).

- [ ] **Step 5: Commit**

```bash
git add backend/src/server.ts
git commit -m "feat(push): wiring do DmGateway + agendador sobe com bot ou firebase"
```

---

### Task 4: Verificação final

**Files:** nenhum (verificação).

**Interfaces:**
- Consumes: tudo das Tasks 1–3.
- Produces: evidência de que o #6b está completo e #1–#6 intactos.

- [ ] **Step 1: Suíte completa + typecheck + build + audit**

Run: `cd backend && npm test`
Expected: **todos passam**. Antes do #6b eram 191; o plano acrescenta **8** (6 em `notification`, 2 em `dmEmbed`) → espere **199 passed, 0 failed**. **Nenhum teste antigo pode ter sido editado** — confirme com `git diff master --stat backend/tests/` que `notification.test.ts` só **cresceu** (nenhuma linha existente alterada além do import e do `setupDm` novo).

Run: `cd backend && npm run typecheck > /dev/null 2>&1; echo "typecheck EXIT=$?"; npm run build > /dev/null 2>&1; echo "build EXIT=$?"; npm audit --omit=dev 2>&1 | tail -1`
Expected: `EXIT=0`, `EXIT=0`, `found 0 vulnerabilities`.

- [ ] **Step 2: Smoke real do roteamento contra o MySQL**

Prova, com repos **reais**, que o promovido **sem app** cai na DM e o **com app** cai no FCM:

```bash
cd backend && cat > smoke.tmp.ts <<'EOF'
import 'dotenv/config';
import { db } from './src/db/db';
import { createUserRepo } from './src/db/repositories/userRepo';
import { createDeviceTokenRepo } from './src/db/repositories/deviceTokenRepo';
import { createNotificationService } from './src/push/notification.service';

(async () => {
  const userRepo = createUserRepo(db);
  const deviceTokenRepo = createDeviceTokenRepo(db);

  const pushes: any[] = []; const dms: any[] = [];
  const notify = createNotificationService({
    gateway: { async send(tokens, msg) { pushes.push({ tokens, msg }); return { invalidTokens: [] }; } },
    dmGateway: { async send(ids, msg) { dms.push({ ids, msg }); } },
    deviceTokenRepo, userRepo,
  });

  const semApp = await userRepo.upsertByDiscordId({ discord_id: 'smk6b-dm', username: 'semapp', nickname: null, avatar: null, email: null, role: 'user' });
  const comApp = await userRepo.upsertByDiscordId({ discord_id: 'smk6b-app', username: 'comapp', nickname: null, avatar: null, email: null, role: 'user' });
  await deviceTokenRepo.upsert(comApp.id, 'tok-6b', 'android');

  const detail = { id: 1, codigo: 'SMK6B', operation: 'Dread Palace', difficulty: 'HM', roster: [
    { usuario_id: semApp.id, status: 'confirmed' }, { usuario_id: comApp.id, status: 'confirmed' },
  ] } as any;

  await notify.raidCancelled(detail);

  console.log('--> pushes:', pushes.length, '| tokens:', JSON.stringify(pushes[0]?.tokens), '(esperado 1 / ["tok-6b"])');
  console.log('--> dms:', dms.length, '| ids:', JSON.stringify(dms[0]?.ids), '(esperado 1 / ["smk6b-dm"])');

  const ok = pushes.length === 1 && pushes[0].tokens[0] === 'tok-6b'
    && dms.length === 1 && dms[0].ids.length === 1 && dms[0].ids[0] === 'smk6b-dm';

  await db.deleteFrom('usuarios').where('id', 'in', [semApp.id, comApp.id]).execute();
  console.log(ok ? '\n=== SMOKE OK ===' : '\n=== SMOKE FALHOU ===');
  await db.destroy();
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.log('FALHOU:', e.code || '', e.sqlMessage || e.message); process.exit(1); });
EOF
npx tsx smoke.tmp.ts; rm -f smoke.tmp.ts
```
Expected: 1 push só para `tok-6b`, 1 DM só para `smk6b-dm`, **sem sobreposição**, `=== SMOKE OK ===`.

- [ ] **Step 3: Smoke manual no Discord (requer `DISCORD_BOT_TOKEN`)**

Só é possível com o bot configurado. Verifique:
1. Entrar numa raid cheia pelo Discord (sem app instalado) → um confirmado sair → **você recebe uma DM do bot** "You're in!", com o título clicável para a raid.
2. Líder cancela → o roster recebe a DM "Raid cancelled".
3. Raid com `start_at` a ~25 min → em até 1 min chega "Raid starting soon", **uma vez só**.
4. Desligar o switch (`PUT /me/push {enabled:false}`) → nada mais chega.
5. Alguém com DMs desativadas → o log mostra `discord: DM não entregue` e **as outras DMs saem normalmente**.

Expected: os 5 conferem. **Se o bot não estiver configurado, reporte como pendente — não marque como verificado.**

- [ ] **Step 4: Commit (se algum ajuste foi necessário)**

```bash
git add -A
git commit -m "test(push): verificacao do #6b (regressao + smokes)"
```

---

## Notas de execução

- **Branch:** execute em `feat/discord-dm-notifications` e faça merge `--no-ff` na `master` ao final (skill `finishing-a-development-branch`).
- **Ordem:** 1 → 2 → 3 → 4. Não paralelize (a 2 estende o arquivo criado na 1).
- **Cuidado com o `cd`:** os comandos de teste precisam rodar em `backend/`; um `cd` de commit anterior persiste no shell. Sempre prefixe com `cd /d/HoloRaid/backend &&`.
- **Não use pipe no typecheck** (`npm run typecheck | tail`) — o pipe engole o exit code e mascara falha. Use `> /dev/null 2>&1; echo "EXIT=$?"`.
- **Ao criar qualquer migration futura**, use `addForeignKeyConstraint` — o MySQL ignora `.references()` inline (ver `007_foreign_keys` pendente).
