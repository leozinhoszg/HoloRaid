# Tempo Real (Socket.IO) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar atualizações ao vivo às raids via Socket.IO — quem vê a lista ou o detalhe recebe entradas/saídas/promoções/transições/criação/remoção sem recarregar, com as mutações permanecendo no REST do #3.

**Architecture:** Model A (broadcast sobre o REST). Um `RaidBroadcaster` injetado no `RaidsController` emite eventos nomeados (com a raid completa) após cada mutação. O Socket.IO é anexado ao mesmo `http.Server` do Express; auth por JWT no handshake; salas `raid:{id}` e `raids`. No Flutter, um `SocketService` alimenta providers `AsyncNotifier` que aplicam o payload ao vivo.

**Tech Stack:** Node/TypeScript, Express, socket.io (+ socket.io-client dev), Zod, vitest + supertest. Flutter (Riverpod AsyncNotifier, socket_io_client).

## Global Constraints

- **Mutações só no REST** (#3). Eventos cliente→servidor são só inscrição: `subscribe:raid`/`unsubscribe:raid`/`subscribe:lobby`/`unsubscribe:lobby`.
- **Auth do socket:** access token do #1 em `handshake.auth.token`, validado por `verifyAccessToken`; sem token válido → conexão recusada.
- **Eventos servidor→cliente carregam a raid completa** (`{ raid: RaidDetail }`), exceto `raidRemoved` (`{ id }`). Nomes: `playerJoined`, `playerLeft`, `raidUpdated`, `raidStarted`, `raidFinished`, `raidCancelled` (sala `raid:{id}`); `raidCreated`, `raidUpdated`, `raidRemoved` (sala `raids`).
- **Broadcaster opcional (default no-op)** no controller → os 104 testes do #1–#3 seguem verdes.
- **Finish/cancel emitem `raidUpdated`** (não removem da lista). `raidRemoved` só no DELETE.
- Backend: `npm run build`/`npm run typecheck` limpos; Flutter: `flutter analyze` limpo.

---

## Mapa de arquivos (novos, salvo indicação)

```
backend/src/
  realtime/
    broadcaster.ts        # RaidBroadcaster + createRaidBroadcaster(io) + noopBroadcaster
    socketServer.ts       # createSocketAuth, registerSubscriptions, registerSocket
  modules/raids/raids.controller.ts  # (MOD) emite via broadcaster
  modules/raids/raids.router.ts       # (MOD) passa broadcaster
  app.ts                 # (MOD) createApp aceita broadcaster
  server.ts              # (MOD) http.Server + io + registerSocket + broadcaster
backend/tests/
  broadcaster.test.ts, socketAuth.test.ts, socket.integration.test.ts

app/lib/
  core/realtime/socket_service.dart   # SocketService + RaidEvent + provider
  features/raids/raids_providers.dart  # (MOD) → AsyncNotifier (list/detail) ao vivo
  features/raids/raids_list_screen.dart   # (MOD) usa raidsListProvider
  features/raids/raid_form_screen.dart    # (MOD) invalidate raidsListProvider
  features/raids/raid_detail_screen.dart  # (MOD) usa raidDetailProvider
pubspec.yaml             # (MOD) + socket_io_client
```

---

# FASE A — Backend

### Task 1: RaidBroadcaster

**Files:**
- Create: `backend/src/realtime/broadcaster.ts`
- Test: `backend/tests/broadcaster.test.ts`

**Interfaces:**
- Consumes: `RaidDetail` (do #3 `raids.service.ts`).
- Produces:
  - `interface RaidBroadcaster { raidCreated(raid: RaidDetail): void; raidUpdated(detail: RaidDetail, event: string): void; raidRemoved(id: number): void }`.
  - `noopBroadcaster: RaidBroadcaster` (no-op).
  - `createRaidBroadcaster(io: Emitter): RaidBroadcaster` onde `Emitter = { to(room: string): { emit(event: string, ...args: any[]): unknown } }` (o `Server` do socket.io satisfaz estruturalmente).

- [ ] **Step 1: Instalar socket.io + socket.io-client (dev)**

Run: `cd backend && npm install socket.io@^4.8.1 && npm install -D socket.io-client@^4.8.1`
Expected: instala sem erro.

- [ ] **Step 2: Escrever o teste que falha** — `backend/tests/broadcaster.test.ts`

```ts
import { createRaidBroadcaster, noopBroadcaster } from '../src/realtime/broadcaster';

type Emit = { room: string; event: string; payload: unknown };

function fakeIo() {
  const emits: Emit[] = [];
  const io = { to: (room: string) => ({ emit: (event: string, payload: unknown) => emits.push({ room, event, payload }) }) };
  return { io, emits };
}

const detail = { id: 7, codigo: 'x', roster: [] } as any;

describe('RaidBroadcaster', () => {
  it('raidUpdated emite o evento na sala da raid e raidUpdated no lobby', () => {
    const { io, emits } = fakeIo();
    createRaidBroadcaster(io).raidUpdated(detail, 'playerJoined');
    expect(emits).toContainEqual({ room: 'raid:7', event: 'playerJoined', payload: { raid: detail } });
    expect(emits).toContainEqual({ room: 'raids', event: 'raidUpdated', payload: { raid: detail } });
  });

  it('raidCreated vai para o lobby', () => {
    const { io, emits } = fakeIo();
    createRaidBroadcaster(io).raidCreated(detail);
    expect(emits).toEqual([{ room: 'raids', event: 'raidCreated', payload: { raid: detail } }]);
  });

  it('raidRemoved vai para lobby e sala da raid', () => {
    const { io, emits } = fakeIo();
    createRaidBroadcaster(io).raidRemoved(7);
    expect(emits).toContainEqual({ room: 'raids', event: 'raidRemoved', payload: { id: 7 } });
    expect(emits).toContainEqual({ room: 'raid:7', event: 'raidRemoved', payload: { id: 7 } });
  });

  it('noopBroadcaster não lança', () => {
    expect(() => { noopBroadcaster.raidCreated(detail); noopBroadcaster.raidUpdated(detail, 'x'); noopBroadcaster.raidRemoved(1); }).not.toThrow();
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `cd backend && npx vitest run tests/broadcaster.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 4: Implementar `backend/src/realtime/broadcaster.ts`**

```ts
import type { RaidDetail } from '../modules/raids/raids.service';

export interface RaidBroadcaster {
  raidCreated(raid: RaidDetail): void;
  raidUpdated(detail: RaidDetail, event: string): void;
  raidRemoved(id: number): void;
}

export const noopBroadcaster: RaidBroadcaster = {
  raidCreated() {},
  raidUpdated() {},
  raidRemoved() {},
};

// Superfície mínima do io para testabilidade; o Server do socket.io a satisfaz
// estruturalmente (any[]/unknown evitam atrito com os generics do socket.io).
type Emitter = { to(room: string): { emit(event: string, ...args: any[]): unknown } };

export function createRaidBroadcaster(io: Emitter): RaidBroadcaster {
  return {
    raidCreated(raid) {
      io.to('raids').emit('raidCreated', { raid });
    },
    raidUpdated(detail, event) {
      io.to(`raid:${detail.id}`).emit(event, { raid: detail });
      io.to('raids').emit('raidUpdated', { raid: detail });
    },
    raidRemoved(id) {
      io.to('raids').emit('raidRemoved', { id });
      io.to(`raid:${id}`).emit('raidRemoved', { id });
    },
  };
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd backend && npx vitest run tests/broadcaster.test.ts && npm run typecheck`
Expected: PASS (4 testes); typecheck exit 0.

- [ ] **Step 6: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/src/realtime/broadcaster.ts backend/tests/broadcaster.test.ts
git commit -m "feat(realtime): RaidBroadcaster (emite eventos nomeados p/ salas)"
```

---

### Task 2: Socket server (auth + inscrições)

**Files:**
- Create: `backend/src/realtime/socketServer.ts`
- Test: `backend/tests/socketAuth.test.ts`

**Interfaces:**
- Consumes: `verifyAccessToken`/`AccessClaims` (#1), `socket.io` (`Server`, `Socket`).
- Produces:
  - `createSocketAuth(verify: (token: string) => AccessClaims)` → middleware `(socket, next)` que anexa `socket.data.user` ou chama `next(new Error('unauthorized'))`.
  - `registerSubscriptions(socket)` → registra os handlers `subscribe/unsubscribe:raid|lobby` (com ack opcional).
  - `registerSocket(io: Server, deps: { verify })` → aplica `io.use(auth)` + `io.on('connection', registerSubscriptions)`.

- [ ] **Step 1: Escrever o teste que falha** — `backend/tests/socketAuth.test.ts`

```ts
import { createSocketAuth, registerSubscriptions } from '../src/realtime/socketServer';

function fakeSocket(token?: string) {
  const joined: string[] = [];
  const left: string[] = [];
  const handlers: Record<string, (payload: any, ack?: () => void) => void> = {};
  return {
    handshake: { auth: token ? { token } : {} },
    data: {} as any,
    join: (r: string) => joined.push(r),
    leave: (r: string) => left.push(r),
    on: (ev: string, fn: any) => { handlers[ev] = fn; },
    joined, left, handlers,
  };
}

describe('socket auth', () => {
  it('recusa sem token', () => {
    const mw = createSocketAuth(() => ({ sub: 1, role: 'user' }));
    let err: Error | undefined;
    mw(fakeSocket() as any, (e?: Error) => { err = e; });
    expect(err?.message).toBe('unauthorized');
  });

  it('recusa token inválido', () => {
    const mw = createSocketAuth(() => { throw new Error('bad'); });
    let err: Error | undefined;
    mw(fakeSocket('t') as any, (e?: Error) => { err = e; });
    expect(err?.message).toBe('unauthorized');
  });

  it('aceita token válido e anexa user', () => {
    const mw = createSocketAuth(() => ({ sub: 42, role: 'admin' }));
    const s = fakeSocket('t') as any;
    let err: Error | undefined = new Error('x');
    mw(s, (e?: Error) => { err = e; });
    expect(err).toBeUndefined();
    expect(s.data.user).toEqual({ sub: 42, role: 'admin' });
  });
});

describe('subscriptions', () => {
  it('subscribe:raid entra na sala e ack', () => {
    const s = fakeSocket('t') as any;
    registerSubscriptions(s);
    let acked = false;
    s.handlers['subscribe:raid']({ id: 5 }, () => { acked = true; });
    expect(s.joined).toContain('raid:5');
    expect(acked).toBe(true);
    s.handlers['unsubscribe:raid']({ id: 5 });
    expect(s.left).toContain('raid:5');
    s.handlers['subscribe:lobby']();
    expect(s.joined).toContain('raids');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && npx vitest run tests/socketAuth.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `backend/src/realtime/socketServer.ts`**

```ts
import type { Server, Socket } from 'socket.io';
import type { AccessClaims } from '../common/security/jwt';

type AuthNext = (err?: Error) => void;

export function createSocketAuth(verify: (token: string) => AccessClaims) {
  return (socket: Socket, next: AuthNext) => {
    const token = (socket.handshake.auth as { token?: string })?.token;
    if (!token) return next(new Error('unauthorized'));
    try {
      socket.data.user = verify(token);
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  };
}

export function registerSubscriptions(socket: Socket) {
  const ack = (cb?: unknown) => { if (typeof cb === 'function') (cb as () => void)(); };
  socket.on('subscribe:raid', (payload: { id?: number }, cb?: unknown) => {
    if (payload?.id) socket.join(`raid:${payload.id}`);
    ack(cb);
  });
  socket.on('unsubscribe:raid', (payload: { id?: number }, cb?: unknown) => {
    if (payload?.id) socket.leave(`raid:${payload.id}`);
    ack(cb);
  });
  socket.on('subscribe:lobby', (cb?: unknown) => { socket.join('raids'); ack(cb); });
  socket.on('unsubscribe:lobby', (cb?: unknown) => { socket.leave('raids'); ack(cb); });
}

export function registerSocket(io: Server, deps: { verify: (token: string) => AccessClaims }) {
  io.use(createSocketAuth(deps.verify));
  io.on('connection', (socket) => registerSubscriptions(socket));
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && npx vitest run tests/socketAuth.test.ts && npm run typecheck`
Expected: PASS (4 testes); typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
git add backend/src/realtime/socketServer.ts backend/tests/socketAuth.test.ts
git commit -m "feat(realtime): socket server (auth por JWT + inscrição em salas)"
```

---

### Task 3: Wiring do broadcaster no controller/router/createApp

**Files:**
- Modify: `backend/src/modules/raids/raids.controller.ts`
- Modify: `backend/src/modules/raids/raids.router.ts`
- Modify: `backend/src/app.ts`
- Test: `backend/tests/raids.routes.test.ts` (já existe; deve continuar passando)

**Interfaces:**
- Consumes: `RaidBroadcaster`/`noopBroadcaster` (Task 1), `RaidService`/`RaidJoinService` (#3).
- Produces:
  - `createRaidsController(raidService, raidJoinService, broadcaster?: RaidBroadcaster)` — emite após cada mutação.
  - `createRaidsRouter(raidService, raidJoinService, broadcaster?: RaidBroadcaster)`.
  - `createApp` ganha `broadcaster?: RaidBroadcaster` em `deps`, repassado ao router.

- [ ] **Step 1: Substituir `backend/src/modules/raids/raids.controller.ts`**

```ts
import type { Request, Response } from 'express';
import type { RaidService, Actor } from './raids.service';
import type { RaidJoinService } from './raidJoin.service';
import { noopBroadcaster, type RaidBroadcaster } from '../../realtime/broadcaster';

const actorOf = (req: Request): Actor => ({ sub: req.user!.sub, role: req.user!.role });

const EVENT: Record<'start' | 'finish' | 'cancel', string> = {
  start: 'raidStarted', finish: 'raidFinished', cancel: 'raidCancelled',
};

export function createRaidsController(raidService: RaidService, raidJoinService: RaidJoinService, broadcaster: RaidBroadcaster = noopBroadcaster) {
  return {
    async create(req: Request, res: Response) {
      const detail = await raidService.create(actorOf(req), req.body as any);
      broadcaster.raidCreated(detail);
      res.status(201).json(detail);
    },
    async list(req: Request, res: Response) {
      const { status, faction, operation } = req.query as Record<string, string | undefined>;
      res.json(await raidService.list({ status, faction, operation }));
    },
    async get(req: Request, res: Response) {
      res.json(await raidService.getDetail(Number(req.params.id)));
    },
    async getByCodigo(req: Request, res: Response) {
      res.json(await raidService.getByCodigo(String(req.params.codigo)));
    },
    async update(req: Request, res: Response) {
      const detail = await raidService.update(actorOf(req), Number(req.params.id), req.body as any);
      broadcaster.raidUpdated(detail, 'raidUpdated');
      res.json(detail);
    },
    async remove(req: Request, res: Response) {
      const id = Number(req.params.id);
      await raidService.remove(actorOf(req), id);
      broadcaster.raidRemoved(id);
      res.status(204).send();
    },
    async duplicate(req: Request, res: Response) {
      const detail = await raidService.duplicate(actorOf(req), Number(req.params.id));
      broadcaster.raidCreated(detail);
      res.status(201).json(detail);
    },
    transition(action: 'start' | 'finish' | 'cancel') {
      return async (req: Request, res: Response) => {
        const detail = await raidService.transition(actorOf(req), Number(req.params.id), action);
        broadcaster.raidUpdated(detail, EVENT[action]);
        res.json(detail);
      };
    },
    async join(req: Request, res: Response) {
      const id = Number(req.params.id);
      const { personagem_id } = req.body as { personagem_id: number };
      const result = await raidJoinService.join(req.user!.sub, id, personagem_id);
      broadcaster.raidUpdated(await raidService.getDetail(id), 'playerJoined');
      res.json(result);
    },
    async leave(req: Request, res: Response) {
      const id = Number(req.params.id);
      await raidJoinService.leave(req.user!.sub, id);
      broadcaster.raidUpdated(await raidService.getDetail(id), 'playerLeft');
      res.status(204).send();
    },
  };
}
```

- [ ] **Step 2: Atualizar `backend/src/modules/raids/raids.router.ts`** — assinatura + repasse

Trocar o cabeçalho da função e o import:

```ts
import type { RaidBroadcaster } from '../../realtime/broadcaster';
```

e:

```ts
export function createRaidsRouter(raidService: RaidService, raidJoinService: RaidJoinService, broadcaster?: RaidBroadcaster): Router {
  const c = createRaidsController(raidService, raidJoinService, broadcaster);
  const r = Router();
  // ... (rotas inalteradas)
```

- [ ] **Step 3: Atualizar `backend/src/app.ts`** — `deps.broadcaster`

Adicionar import e o campo em `deps`, e repassar:

```ts
import type { RaidBroadcaster } from './realtime/broadcaster';
```

No tipo de `deps`, após `raidJoinService?`:

```ts
  broadcaster?: RaidBroadcaster;
```

E na montagem:

```ts
  if (deps.raidService && deps.raidJoinService) {
    app.use('/', createRaidsRouter(deps.raidService, deps.raidJoinService, deps.broadcaster));
  }
```

- [ ] **Step 4: Rodar os testes de rota do #3 (regressão)**

Run: `cd backend && npx vitest run tests/raids.routes.test.ts && npm run typecheck`
Expected: PASS (6 testes, broadcaster default no-op); typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/raids/raids.controller.ts backend/src/modules/raids/raids.router.ts backend/src/app.ts
git commit -m "feat(realtime): controller emite via broadcaster (opcional/no-op)"
```

---

### Task 4: Bootstrap (http+io) + integração ponta a ponta

**Files:**
- Modify: `backend/src/server.ts`
- Test: `backend/tests/socket.integration.test.ts`

**Interfaces:**
- Consumes: `registerSocket` (Task 2), `createRaidBroadcaster` (Task 1), `createApp` (Task 3), `verifyAccessToken` (#1), `socket.io`/`socket.io-client`.
- Produces: `server.ts` cria `http.Server` sem app, anexa `io`, registra socket, cria broadcaster, monta `createApp({..., broadcaster})`, liga `request` e escuta.

- [ ] **Step 1: Escrever o teste de integração que falha** — `backend/tests/socket.integration.test.ts`

```ts
import http from 'node:http';
import request from 'supertest';
import { Server } from 'socket.io';
import { io as ioClient, type Socket } from 'socket.io-client';
import { createApp } from '../src/app';
import { registerSocket } from '../src/realtime/socketServer';
import { createRaidBroadcaster } from '../src/realtime/broadcaster';
import { verifyAccessToken, signAccessToken } from '../src/common/security/jwt';
import { makeFakeRaidRepo, makeFakeRaidPlayerRepo, makeFakePersonagemRepo } from './fakes/fakeRepos';
import { createRaidService } from '../src/modules/raids/raids.service';
import { createRaidJoinService } from '../src/modules/raids/raidJoin.service';

beforeAll(() => {
  process.env.JWT_SECRET = 'z'.repeat(40); process.env.DISCORD_CLIENT_ID = 'C';
  process.env.DISCORD_CLIENT_SECRET = 'S'; process.env.DISCORD_REDIRECT_URI = 'http://localhost/cb';
  process.env.CORS_ORIGINS = 'http://localhost:8080';
});

async function boot() {
  const raidRepo = makeFakeRaidRepo();
  const personagemRepo = makeFakePersonagemRepo();
  const raidPlayerRepo = makeFakeRaidPlayerRepo(personagemRepo);
  const raidService = createRaidService({ raidRepo, raidPlayerRepo });
  const raidJoinService = createRaidJoinService({ raidRepo, raidPlayerRepo, personagemRepo });

  const httpServer = http.createServer();
  const io = new Server(httpServer, { cors: { origin: true } });
  registerSocket(io, { verify: verifyAccessToken });
  const broadcaster = createRaidBroadcaster(io);
  const app = createApp({ authService: {} as any, raidService, raidJoinService, broadcaster });
  httpServer.on('request', app);
  await new Promise<void>((r) => httpServer.listen(0, r));
  const port = (httpServer.address() as any).port as number;
  return { app, io, httpServer, port, raidService, personagemRepo };
}

const tok = (sub: number, role: 'user' | 'admin' = 'user') => signAccessToken({ sub, role });

function connect(port: number, token?: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const c = ioClient(`http://localhost:${port}`, { transports: ['websocket'], auth: token ? { token } : {}, reconnection: false });
    c.on('connect', () => resolve(c));
    c.on('connect_error', (e) => reject(e));
  });
}

describe('socket integração', () => {
  it('recusa conexão sem token', async () => {
    const { io, httpServer, port } = await boot();
    await expect(connect(port)).rejects.toBeTruthy();
    io.close(); httpServer.close();
  });

  it('inscrito em raid:{id} recebe playerJoined ao dar join via REST', async () => {
    const ctx = await boot();
    const raid = await ctx.raidService.create({ sub: 1, role: 'user' }, {
      operation: 'Dread Palace', difficulty: 'HM', size: 8, faction: 'Republic', minimum_tier: 0,
      check_composition: false, slots_tank: 2, slots_heal: 2, slots_dps: 4, notes: null, start_at: new Date('2026-08-01T20:30:00Z'),
    });
    const p = await ctx.personagemRepo.create({ usuario_id: 5, nome: 'Ok', faccao: 'Republic', classe: 'Sentinel', especializacao: null, role: 'DPS', origin_story: null, item_level: 330 });

    const client = await connect(ctx.port, tok(5));
    await client.emitWithAck('subscribe:raid', { id: raid.id });
    const got = new Promise<any>((resolve) => client.once('playerJoined', resolve));

    await request(ctx.app).post(`/raids/${raid.id}/join`).set('Authorization', `Bearer ${tok(5)}`).send({ personagem_id: p.id });

    const payload = await got;
    expect(payload.raid.id).toBe(raid.id);
    expect(payload.raid.roster).toHaveLength(1);

    client.close(); ctx.io.close(); ctx.httpServer.close();
  });

  it('não recebe evento de outra raid', async () => {
    const ctx = await boot();
    const mk = () => ctx.raidService.create({ sub: 1, role: 'user' }, {
      operation: 'Dread Palace', difficulty: 'HM', size: 8, faction: 'Republic', minimum_tier: 0,
      check_composition: false, slots_tank: 2, slots_heal: 2, slots_dps: 4, notes: null, start_at: new Date('2026-08-01T20:30:00Z'),
    });
    const raidA = await mk();
    const raidB = await mk();
    const p = await ctx.personagemRepo.create({ usuario_id: 5, nome: 'Ok', faccao: 'Republic', classe: 'Sentinel', especializacao: null, role: 'DPS', origin_story: null, item_level: 330 });

    const client = await connect(ctx.port, tok(5));
    await client.emitWithAck('subscribe:raid', { id: raidA.id });
    let leaked = false;
    client.on('playerJoined', () => { leaked = true; });

    await request(ctx.app).post(`/raids/${raidB.id}/join`).set('Authorization', `Bearer ${tok(5)}`).send({ personagem_id: p.id });
    await new Promise((r) => setTimeout(r, 100));
    expect(leaked).toBe(false);

    client.close(); ctx.io.close(); ctx.httpServer.close();
  });
});
```

- [ ] **Step 2: Rodar o teste de integração**

Run: `cd backend && npx vitest run tests/socket.integration.test.ts`
Expected: **PASS (3 testes)**. Este teste monta o `io` inline (não depende do `server.ts`), então valida a composição das Tasks 1–3 de ponta a ponta: recusa sem token, recebe `playerJoined` ao dar join via REST, e isolamento entre salas. O `server.ts` abaixo é só o wiring de produção (verificado por build).

- [ ] **Step 3: Substituir `backend/src/server.ts`** — http.Server + io

```ts
import http from 'node:http';
import { Server } from 'socket.io';
import { getConfig } from './config';
import { createDb } from './db/db';
import { createUserRepo } from './db/repositories/userRepo';
import { createRefreshTokenRepo } from './db/repositories/refreshTokenRepo';
import { createAuditLog } from './db/repositories/auditRepo';
import { createAuthService } from './modules/auth/auth.service';
import { createUserService } from './modules/users/users.service';
import { createPersonagemRepo } from './db/repositories/personagemRepo';
import { createBossRepo } from './db/repositories/bossRepo';
import { createCharacterBossRepo } from './db/repositories/characterBossRepo';
import { createCharacterService } from './modules/characters/characters.service';
import { createProgressionService } from './modules/progression/progression.service';
import { createRaidRepo } from './db/repositories/raidRepo';
import { createRaidPlayerRepo } from './db/repositories/raidPlayerRepo';
import { createRaidService } from './modules/raids/raids.service';
import { createRaidJoinService } from './modules/raids/raidJoin.service';
import { registerSocket } from './realtime/socketServer';
import { createRaidBroadcaster } from './realtime/broadcaster';
import { verifyAccessToken } from './common/security/jwt';
import { createApp } from './app';
import { logger } from './common/logger/logger';

const cfg = getConfig(); // fail-fast
const db = createDb();

const userRepo = createUserRepo(db);
const refreshRepo = createRefreshTokenRepo(db);
const authService = createAuthService({
  userRepo, refreshRepo,
  config: { ADMIN_DISCORD_IDS: cfg.ADMIN_DISCORD_IDS, REFRESH_TOKEN_TTL_DAYS: cfg.REFRESH_TOKEN_TTL_DAYS },
});
const userService = createUserService({ userRepo, auditLog: createAuditLog(db) });

const personagemRepo = createPersonagemRepo(db);
const bossRepo = createBossRepo(db);
const charBossRepo = createCharacterBossRepo(db);
const characterService = createCharacterService({ personagemRepo });
const progressionService = createProgressionService({ personagemRepo, bossRepo, charBossRepo });

const raidRepo = createRaidRepo(db);
const raidPlayerRepo = createRaidPlayerRepo(db);
const raidService = createRaidService({ raidRepo, raidPlayerRepo });
const raidJoinService = createRaidJoinService({ raidRepo, raidPlayerRepo, personagemRepo });

// Socket.IO no mesmo http.Server (sem app ainda, p/ quebrar o ciclo io↔broadcaster↔app)
const httpServer = http.createServer();
const io = new Server(httpServer, {
  cors: { origin: cfg.CORS_ORIGINS.length ? cfg.CORS_ORIGINS : false, credentials: true },
});
registerSocket(io, { verify: verifyAccessToken });
const broadcaster = createRaidBroadcaster(io);

const app = createApp({ authService, userService, characterService, progressionService, bossRepo, raidService, raidJoinService, broadcaster });
httpServer.on('request', app);
httpServer.listen(cfg.PORT, () => logger.info(`RaidSync backend (HTTP+Socket.IO) ouvindo em :${cfg.PORT}`));
```

- [ ] **Step 4: Rodar o teste de integração + build**

Run: `cd backend && npx vitest run tests/socket.integration.test.ts && npm run build`
Expected: PASS (3 testes); build exit 0.

- [ ] **Step 5: Rodar a suíte inteira**

Run: `cd backend && npm test`
Expected: todos verdes (inclui #1–#3 + broadcaster/socketAuth/integração).

- [ ] **Step 6: Commit**

```bash
git add backend/src/server.ts backend/tests/socket.integration.test.ts
git commit -m "feat(realtime): bootstrap http+Socket.IO + teste de integração ponta a ponta"
```

---

# FASE B — Flutter

### Task 5: SocketService + socket_io_client

**Files:**
- Modify: `app/pubspec.yaml`
- Create: `app/lib/core/realtime/socket_service.dart`

**Interfaces:**
- Consumes: `TokenStorage` (#1), `AppConfig` (#1), `Raid` (#3 `raid_model.dart`).
- Produces:
  - `class RaidEvent { final String name; final Raid? raid; final int? removedId; }`.
  - `class SocketService` com `connect()`, `subscribeRaid(int)`, `unsubscribeRaid(int)`, `subscribeLobby()`, `unsubscribeLobby()`, `Stream<RaidEvent> get events`, `dispose()`.
  - `socketServiceProvider` (Provider) que constrói + conecta usando `tokenStorageProvider`.

- [ ] **Step 1: Adicionar `socket_io_client` em `app/pubspec.yaml`** (dependencies)

```yaml
  socket_io_client: ^2.0.3+1
```

Run: `cd app && flutter pub get`
Expected: resolvido.

- [ ] **Step 2: Implementar `app/lib/core/realtime/socket_service.dart`**

```dart
import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import '../auth/auth_providers.dart';
import '../auth/token_storage.dart';
import '../config/app_config.dart';
import '../../features/raids/raid_model.dart';

class RaidEvent {
  final String name;
  final Raid? raid;
  final int? removedId;
  RaidEvent(this.name, {this.raid, this.removedId});
}

const _raidEvents = ['playerJoined', 'playerLeft', 'raidUpdated', 'raidStarted', 'raidFinished', 'raidCancelled', 'raidCreated'];

class SocketService {
  final TokenStorage storage;
  io.Socket? _socket;
  final _controller = StreamController<RaidEvent>.broadcast();
  final Set<int> _raidRooms = {};
  bool _lobby = false;

  SocketService(this.storage);

  Stream<RaidEvent> get events => _controller.stream;

  void connect() {
    if (_socket != null) return;
    final s = io.io(
      AppConfig.apiBaseUrl,
      io.OptionBuilder().setTransports(['websocket']).disableAutoConnect().setAuth({'token': storage.accessToken}).build(),
    );
    _socket = s;
    for (final name in _raidEvents) {
      s.on(name, (data) {
        final raw = (data as Map)['raid'];
        if (raw != null) _controller.add(RaidEvent(name, raid: Raid.fromJson((raw as Map).cast<String, dynamic>())));
      });
    }
    s.on('raidRemoved', (data) {
      final id = (data as Map)['id'];
      if (id is int) _controller.add(RaidEvent('raidRemoved', removedId: id));
    });
    s.onConnect((_) => _resubscribe());
    s.onReconnectAttempt((_) => s.auth = {'token': storage.accessToken});
    s.connect();
  }

  void _resubscribe() {
    if (_lobby) _socket?.emit('subscribe:lobby');
    for (final id in _raidRooms) {
      _socket?.emit('subscribe:raid', {'id': id});
    }
  }

  void subscribeRaid(int id) { _raidRooms.add(id); _socket?.emit('subscribe:raid', {'id': id}); }
  void unsubscribeRaid(int id) { _raidRooms.remove(id); _socket?.emit('unsubscribe:raid', {'id': id}); }
  void subscribeLobby() { _lobby = true; _socket?.emit('subscribe:lobby'); }
  void unsubscribeLobby() { _lobby = false; _socket?.emit('unsubscribe:lobby'); }

  void dispose() {
    _socket?.dispose();
    _controller.close();
  }
}

final socketServiceProvider = Provider<SocketService>((ref) {
  final s = SocketService(ref.watch(tokenStorageProvider))..connect();
  ref.onDispose(s.dispose);
  return s;
});
```

- [ ] **Step 3: Verificar**

Run: `cd app && flutter analyze`
Expected: No issues found.

- [ ] **Step 4: Commit**

```bash
git add app/pubspec.yaml app/pubspec.lock app/lib/core/realtime/socket_service.dart
git commit -m "feat(app): SocketService (conexão autenticada + stream de eventos)"
```

---

### Task 6: Providers ao vivo + telas

**Files:**
- Modify: `app/lib/features/raids/raids_providers.dart`
- Modify: `app/lib/features/raids/raids_list_screen.dart`
- Modify: `app/lib/features/raids/raid_form_screen.dart`
- Modify: `app/lib/features/raids/raid_detail_screen.dart`

**Interfaces:**
- Consumes: `socketServiceProvider`/`RaidEvent` (Task 5), `raidsRepositoryProvider` (#3).
- Produces:
  - `raidsListProvider` (`AutoDisposeAsyncNotifierProvider<RaidsListNotifier, List<Raid>>`).
  - `raidDetailProvider` (`AutoDisposeAsyncNotifierProviderFamily<RaidDetailNotifier, Raid, int>`).
  - (remove os antigos `raidsProvider`/`raidProvider`.)

- [ ] **Step 1: Substituir `app/lib/features/raids/raids_providers.dart`**

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/auth/auth_providers.dart';
import '../../core/realtime/socket_service.dart';
import 'raid_model.dart';
import 'raids_repository.dart';

final raidsRepositoryProvider = Provider<RaidsRepository>((ref) => RaidsRepository(ref.watch(apiClientProvider)));

final raidsListProvider = AsyncNotifierProvider.autoDispose<RaidsListNotifier, List<Raid>>(RaidsListNotifier.new);

class RaidsListNotifier extends AutoDisposeAsyncNotifier<List<Raid>> {
  @override
  Future<List<Raid>> build() async {
    final socket = ref.watch(socketServiceProvider);
    socket.subscribeLobby();
    ref.onDispose(socket.unsubscribeLobby);
    final sub = socket.events.listen(_apply);
    ref.onDispose(sub.cancel);
    return ref.read(raidsRepositoryProvider).list();
  }

  void _apply(RaidEvent e) {
    final current = state.valueOrNull ?? const <Raid>[];
    if (e.name == 'raidRemoved') {
      state = AsyncData(current.where((r) => r.id != e.removedId).toList());
      return;
    }
    final raid = e.raid;
    if (raid == null) return;
    if (e.name == 'raidCreated') {
      state = AsyncData([raid, ...current.where((r) => r.id != raid.id)]);
    } else {
      state = AsyncData(current.map((r) => r.id == raid.id ? raid : r).toList());
    }
  }
}

final raidDetailProvider = AsyncNotifierProvider.autoDispose.family<RaidDetailNotifier, Raid, int>(RaidDetailNotifier.new);

class RaidDetailNotifier extends AutoDisposeFamilyAsyncNotifier<Raid, int> {
  @override
  Future<Raid> build(int arg) async {
    final socket = ref.watch(socketServiceProvider);
    socket.subscribeRaid(arg);
    ref.onDispose(() => socket.unsubscribeRaid(arg));
    final sub = socket.events.listen((e) {
      if (e.name == 'raidRemoved' && e.removedId == arg) {
        state = AsyncError('Raid removida', StackTrace.current);
        return;
      }
      final raid = e.raid;
      if (raid != null && raid.id == arg) state = AsyncData(raid);
    });
    ref.onDispose(sub.cancel);
    return ref.read(raidsRepositoryProvider).get(arg);
  }
}
```

- [ ] **Step 2: Atualizar `app/lib/features/raids/raids_list_screen.dart`** — usar `raidsListProvider`

Trocar `ref.watch(raidsProvider(null))` por `ref.watch(raidsListProvider)` e
`ref.refresh(raidsProvider(null).future)` por `ref.refresh(raidsListProvider.future)`.
(Duas ocorrências.)

- [ ] **Step 3: Atualizar `app/lib/features/raids/raid_form_screen.dart`** — invalidação

Trocar `ref.invalidate(raidsProvider)` por `ref.invalidate(raidsListProvider)`.

- [ ] **Step 4: Atualizar `app/lib/features/raids/raid_detail_screen.dart`** — usar `raidDetailProvider`

Trocar todas as ocorrências de `raidProvider(` por `raidDetailProvider(`:
- `ref.watch(raidProvider(id))` → `ref.watch(raidDetailProvider(id))`
- `ref.invalidate(raidProvider(raid.id))` → `ref.invalidate(raidDetailProvider(raid.id))`
- `ref.invalidate(raidProvider(id))` → `ref.invalidate(raidDetailProvider(id))`

> **Nota:** com o socket, o próprio ator recebe o eco e o estado atualiza sozinho; manter os `invalidate` garante feedback imediato mesmo se o socket estiver reconectando. Idempotente.

- [ ] **Step 5: Verificar**

Run: `cd app && flutter analyze && flutter test`
Expected: No issues found; testes passam.

- [ ] **Step 6: Build web (prova de compilação)**

Run: `cd app && flutter build web --dart-define=API_BASE_URL=http://localhost:3010`
Expected: `√ Built build/web`.

- [ ] **Step 7: Commit**

```bash
git add app/lib/features/raids/raids_providers.dart app/lib/features/raids/raids_list_screen.dart app/lib/features/raids/raid_form_screen.dart app/lib/features/raids/raid_detail_screen.dart
git commit -m "feat(app): raids ao vivo (AsyncNotifier consumindo eventos do socket)"
```

---

## Verificação final (Definition of Done)

- [ ] `cd backend && npm test` — toda a suíte verde (broadcaster, socketAuth, socket.integration + #1–#3).
- [ ] `cd backend && npm run build && npm run typecheck` — exit 0.
- [ ] `cd app && flutter analyze && flutter test` — limpos; `flutter build web` compila.
- [ ] Smoke manual opcional (2 abas): abrir a mesma raid em duas sessões; join numa aba aparece na outra ao vivo.

---

## Self-review (cobertura do spec)

- Model A (broadcast sobre REST; eventos cliente = inscrição): Tasks 2, 3. ✓
- Auth do socket por JWT (recusa sem token): Tasks 2, 4. ✓
- Broadcaster + eventos nomeados com raid completa: Tasks 1, 3. ✓
- Salas raid:{id} e raids; finish/cancel = raidUpdated (não remove); raidRemoved só no DELETE: Tasks 1, 3. ✓
- http+io no mesmo servidor: Task 4. ✓
- Broadcaster opcional/no-op → #1–#3 verdes: Tasks 1, 3. ✓
- Flutter SocketService + AsyncNotifier ao vivo + resync: Tasks 5, 6. ✓
- Testes: broadcaster unit, socket auth unit, integração ponta a ponta + isolamento: Tasks 1, 2, 4. ✓
