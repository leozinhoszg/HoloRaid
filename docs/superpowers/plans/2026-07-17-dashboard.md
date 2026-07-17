# Dashboard global (#7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uma tela de estatísticas globais da comunidade (raids hoje/semana/mês, participantes, top operations, top jogadores), visível a qualquer usuário logado, com as faixas de tempo respeitando o fuso do usuário.

**Architecture:** Um `DashboardService` que faz ~4 queries de agregação direto no Kysely. As faixas "hoje/semana/mês" vêm de fronteiras que o **cliente** calcula em local e envia como ISO UTC; o servidor só conta `start_at >= fronteira` (fallback UTC se ausentes). Endpoint `GET /dashboard` atrás de `requireAuth`.

**Tech Stack:** Node/TypeScript, Kysely + mysql2, Zod, Express, vitest + supertest; Flutter (Riverpod, go_router, Dio).

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-17-dashboard-design.md`.
- **Global/comunidade, read-only.** Nenhuma tabela nova, nenhuma escrita.
- **Fuso: o cliente manda as fronteiras** (`today`/`week`/`month`, ISO UTC). O servidor **não** faz aritmética de fuso; se um param faltar/for inválido, cai em fronteira **UTC**.
- **Raids CANCELLED não contam** em nenhuma métrica.
- **Rankings all-time, top 5.** Participantes = distintos, do mês.
- **`dashboardService` é OPCIONAL no `createApp`** (padrão do projeto) → #1–007 intactos.
- **mysql2 devolve COUNT como string** (BIGINT) — sempre `Number(...)` no resultado.
- **Acesso:** `requireAuth` (já existe). Sem nada novo de auth.
- **Regressão:** os **202 testes** de #1–007 seguem verdes.
- **Commits:** autor `Leonardo de Souza Guimarães <leozinhoszg@gmail.com>`. **NUNCA** `Co-Authored-By: Claude`.
- Backend em `backend/`. Testes: `npx vitest run <arquivo>`. Typecheck: `npm run typecheck > /dev/null 2>&1; echo "EXIT=$?"` (**não use pipe**). Prefixe comandos com `cd /d/HoloRaid/backend &&` (o cwd escapa entre chamadas).

---

### Task 1: DashboardService + queries de agregação

**Files:**
- Create: `backend/src/modules/dashboard/dashboard.service.ts`
- Test: `backend/tests/dashboard.service.test.ts`

**Interfaces:**
- Consumes: `Kysely<DB>` (schema do projeto), tabelas `raids`/`raid_players`/`usuarios`.
- Produces:
  - `export type DashboardStats = { raids: { today: number; week: number; month: number }; participantsThisMonth: number; topOperations: { operation: string; count: number }[]; topPlayers: { usuario_id: number; username: string; avatar: string | null; raids: number }[] }`
  - `export type Boundaries = { today: Date; week: Date; month: Date }`
  - `createDashboardService(deps: { db: Kysely<DB> }): { getStats(b: Boundaries): Promise<DashboardStats> }`
  - `export type DashboardService = ReturnType<typeof createDashboardService>`

> **Teste com o MySQL real.** Diferente dos outros services, este é pura agregação SQL — um fake não provaria as queries. O teste usa o `db` real, semeia dados com prefixo próprio e limpa no final (mesmo padrão dos smokes). Importa `createDb` de `../src/db/db` ou reusa o singleton `db`.

- [ ] **Step 1: Write the failing test**

Crie `backend/tests/dashboard.service.test.ts`:

```ts
import 'dotenv/config';
import { db } from '../src/db/db';
import { createDashboardService } from '../src/modules/dashboard/dashboard.service';
import { createUserRepo } from '../src/db/repositories/userRepo';
import { createPersonagemRepo } from '../src/db/repositories/personagemRepo';
import { createRaidRepo } from '../src/db/repositories/raidRepo';
import { createRaidPlayerRepo } from '../src/db/repositories/raidPlayerRepo';

const svc = createDashboardService({ db });
const userRepo = createUserRepo(db);
const personagemRepo = createPersonagemRepo(db);
const raidRepo = createRaidRepo(db);
const raidPlayerRepo = createRaidPlayerRepo(db);

// tudo criado neste teste usa este marcador p/ isolar do resto do banco
const MARK = 'DASH7';
const created = { users: [] as number[], raids: [] as number[] };

async function mkUser(tag: string) {
  const u = await userRepo.upsertByDiscordId({ discord_id: `${MARK}-${tag}`, username: `${MARK}_${tag}`, nickname: null, avatar: null, email: null, role: 'user' });
  created.users.push(u.id); return u;
}
async function mkRaid(operation: string, startAt: Date, createdBy: number, status?: 'CANCELLED') {
  const r = await raidRepo.create({ codigo: `${MARK}${created.raids.length}`, operation, difficulty: 'HM', size: 8, faction: 'Republic', minimum_tier: 0, check_composition: false, slots_tank: 2, slots_heal: 2, slots_dps: 4, notes: null, start_at: startAt, created_by: createdBy } as any);
  if (status) await raidRepo.updateStatus(r.id, status);
  created.raids.push(r.id); return r;
}

// filtra só as linhas deste teste (o dashboard é global; isolamos por MARK)
const onlyMark = (stats: any) => ({
  ...stats,
  topOperations: stats.topOperations.filter((o: any) => o.operation.startsWith(MARK)),
  topPlayers: stats.topPlayers.filter((p: any) => created.users.includes(p.usuario_id)),
});

afterAll(async () => {
  for (const id of created.raids) await raidRepo.delete(id);            // cascata limpa raid_players (007)
  if (created.users.length) await db.deleteFrom('usuarios').where('id', 'in', created.users).execute();
  await db.destroy();
});

describe('DashboardService', () => {
  it('conta raids por faixa e ignora CANCELLED', async () => {
    const u = await mkUser('leader');
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const weekStart = new Date(todayStart.getTime() - 3 * 86400_000);

    await mkRaid(`${MARK}_Op`, new Date(todayStart.getTime() + 3600_000)); // hoje
    await mkRaid(`${MARK}_Op`, new Date(todayStart.getTime() - 2 * 86400_000)); // 2 dias atrás (fora de hoje/semana)
    await mkRaid(`${MARK}_Op`, new Date(todayStart.getTime() + 7200_000), u.id, 'CANCELLED'); // hoje, mas cancelada

    const b = { today: todayStart, week: weekStart, month: monthStart };
    const stats = await svc.getStats(b);

    // outras raids do banco podem existir; asseguramos o piso pelas nossas
    expect(stats.raids.today).toBeGreaterThanOrEqual(1);
    // a CANCELLED de hoje NÃO soma: validamos via topOperations (isolado por MARK)
    const op = onlyMark(stats).topOperations.find((o: any) => o.operation === `${MARK}_Op`);
    expect(op!.count).toBe(2); // 2 não-canceladas, a CANCELLED não entra
  });

  it('participantsThisMonth conta distintos e topPlayers ordena', async () => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const u1 = await mkUser('p1'); const u2 = await mkUser('p2');
    const c1 = await personagemRepo.create({ usuario_id: u1.id, nome: 'C1', faccao: 'Republic', classe: 'Guardian', especializacao: null, role: 'Tank', origin_story: null, item_level: 340 } as any);
    const c2 = await personagemRepo.create({ usuario_id: u2.id, nome: 'C2', faccao: 'Republic', classe: 'Guardian', especializacao: null, role: 'Tank', origin_story: null, item_level: 340 } as any);
    const rA = await mkRaid(`${MARK}_P`, new Date(todayStart.getTime() + 3600_000), u1.id);
    const rB = await mkRaid(`${MARK}_P`, new Date(todayStart.getTime() + 3600_000), u1.id);
    // u1 entra em 2 raids (conta 1 participante), u2 em 1
    await raidPlayerRepo.create({ raid_id: rA.id, usuario_id: u1.id, personagem_id: c1.id, role: 'Tank', status: 'confirmed', joined_at: new Date() });
    await raidPlayerRepo.create({ raid_id: rB.id, usuario_id: u1.id, personagem_id: c1.id, role: 'Tank', status: 'confirmed', joined_at: new Date() });
    await raidPlayerRepo.create({ raid_id: rA.id, usuario_id: u2.id, personagem_id: c2.id, role: 'Tank', status: 'confirmed', joined_at: new Date() });

    const stats = await svc.getStats({ today: todayStart, week: monthStart, month: monthStart });
    expect(stats.participantsThisMonth).toBeGreaterThanOrEqual(2);

    const players = onlyMark(stats).topPlayers;
    const p1 = players.find((p: any) => p.usuario_id === u1.id);
    const p2 = players.find((p: any) => p.usuario_id === u2.id);
    expect(p1!.raids).toBe(2);
    expect(p2!.raids).toBe(1);
    expect(p1!.username).toBe(`${MARK}_p1`);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/dashboard.service.test.ts`
Expected: FAIL — não resolve `../src/modules/dashboard/dashboard.service`.

- [ ] **Step 3: Implementar o service**

Crie `backend/src/modules/dashboard/dashboard.service.ts`:

```ts
import type { Kysely } from 'kysely';
import type { DB } from '../../db/schema';

export type DashboardStats = {
  raids: { today: number; week: number; month: number };
  participantsThisMonth: number;
  topOperations: { operation: string; count: number }[];
  topPlayers: { usuario_id: number; username: string; avatar: string | null; raids: number }[];
};
export type Boundaries = { today: Date; week: Date; month: Date };

export function createDashboardService(deps: { db: Kysely<DB> }) {
  const { db } = deps;

  // COUNT de raids não-canceladas com start_at >= from
  async function countRaidsSince(from: Date): Promise<number> {
    const row = await db.selectFrom('raids')
      .select((eb) => eb.fn.countAll<string>().as('n'))
      .where('status', '!=', 'CANCELLED')
      .where('start_at', '>=', from)
      .executeTakeFirstOrThrow();
    return Number(row.n);
  }

  return {
    async getStats(b: Boundaries): Promise<DashboardStats> {
      const [today, week, month] = await Promise.all([
        countRaidsSince(b.today), countRaidsSince(b.week), countRaidsSince(b.month),
      ]);

      // participantes distintos em raids não-canceladas do mês
      const partRow = await db.selectFrom('raid_players')
        .innerJoin('raids', 'raids.id', 'raid_players.raid_id')
        .select((eb) => eb.fn.count<string>('raid_players.usuario_id').distinct().as('n'))
        .where('raids.status', '!=', 'CANCELLED')
        .where('raids.start_at', '>=', b.month)
        .executeTakeFirstOrThrow();

      // top 5 operations por nº de raids não-canceladas (all-time)
      const ops = await db.selectFrom('raids')
        .select((eb) => ['operation', eb.fn.countAll<string>().as('count')])
        .where('status', '!=', 'CANCELLED')
        .groupBy('operation').orderBy('count', 'desc').limit(5)
        .execute();

      // top 5 jogadores por nº de inscrições (all-time)
      const players = await db.selectFrom('raid_players')
        .innerJoin('usuarios', 'usuarios.id', 'raid_players.usuario_id')
        .select((eb) => [
          'raid_players.usuario_id as usuario_id', 'usuarios.username as username', 'usuarios.avatar as avatar',
          eb.fn.countAll<string>().as('raids'),
        ])
        .groupBy(['raid_players.usuario_id', 'usuarios.username', 'usuarios.avatar'])
        .orderBy('raids', 'desc').limit(5)
        .execute();

      return {
        raids: { today, week, month },
        participantsThisMonth: Number(partRow.n),
        topOperations: ops.map((o) => ({ operation: o.operation, count: Number(o.count) })),
        topPlayers: players.map((p) => ({ usuario_id: p.usuario_id, username: p.username, avatar: p.avatar, raids: Number(p.raids) })),
      };
    },
  };
}

export type DashboardService = ReturnType<typeof createDashboardService>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/dashboard.service.test.ts && npm run typecheck > /dev/null 2>&1; echo "EXIT=$?"`
Expected: 2 testes PASS e `EXIT=0`.

> Se o typecheck reclamar do genérico em `eb.fn.count<string>(...)`/`countAll<string>()`, troque por `eb.fn.count('...')` sem genérico e mantenha o `Number(...)` (mysql2 devolve string em runtime de qualquer forma). Se `orderBy('count', 'desc')` não aceitar o alias, use `orderBy(eb.fn.countAll(), 'desc')`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/dashboard/dashboard.service.ts backend/tests/dashboard.service.test.ts
git commit -m "feat(dashboard): DashboardService com queries de agregacao"
```

---

### Task 2: Endpoint GET /dashboard (controller + router + wiring)

**Files:**
- Create: `backend/src/modules/dashboard/dashboard.controller.ts`
- Create: `backend/src/modules/dashboard/dashboard.router.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/server.ts`
- Test: `backend/tests/dashboard.routes.test.ts`

**Interfaces:**
- Consumes: `DashboardService` (Task 1), `requireAuth` (#1).
- Produces:
  - `createDashboardRouter(service: DashboardService): Router` → `GET /dashboard`.
  - `createApp({ ..., dashboardService?: DashboardService })`.
  - Helpers de fallback UTC: `startOfUtcDay/Week/Month(now: Date): Date`.

- [ ] **Step 1: Write the failing test**

Crie `backend/tests/dashboard.routes.test.ts`:

```ts
import request from 'supertest';
import { createApp } from '../src/app';
import { signAccessToken } from '../src/common/security/jwt';

beforeAll(() => { process.env.JWT_SECRET = 'z'.repeat(40); process.env.DISCORD_CLIENT_ID = 'C'; process.env.DISCORD_CLIENT_SECRET = 'S'; process.env.DISCORD_REDIRECT_URI = 'http://localhost/cb'; });

// service falso: devolve um shape fixo e registra as Boundaries recebidas
function fakeService(spy?: (b: any) => void) {
  return {
    async getStats(b: any) {
      spy?.(b);
      return { raids: { today: 1, week: 2, month: 3 }, participantsThisMonth: 4,
        topOperations: [{ operation: 'Dread Palace', count: 5 }],
        topPlayers: [{ usuario_id: 1, username: 'kira', avatar: null, raids: 6 }] };
    },
  };
}
const tok = () => signAccessToken({ sub: 1, role: 'user' });

describe('GET /dashboard', () => {
  it('sem JWT → 401', async () => {
    const app = createApp({ authService: {} as any, dashboardService: fakeService() as any });
    expect((await request(app).get('/dashboard')).status).toBe(401);
  });

  it('com JWT → 200 e shape completo', async () => {
    const app = createApp({ authService: {} as any, dashboardService: fakeService() as any });
    const res = await request(app).get('/dashboard').set('Authorization', `Bearer ${tok()}`);
    expect(res.status).toBe(200);
    expect(res.body.raids).toEqual({ today: 1, week: 2, month: 3 });
    expect(res.body.participantsThisMonth).toBe(4);
    expect(res.body.topOperations[0].operation).toBe('Dread Palace');
    expect(res.body.topPlayers[0].username).toBe('kira');
  });

  it('params today/week/month são repassados como Boundaries', async () => {
    let got: any;
    const app = createApp({ authService: {} as any, dashboardService: fakeService((b) => { got = b; }) as any });
    const today = '2026-07-17T03:00:00.000Z';
    await request(app).get(`/dashboard?today=${today}&week=2026-07-13T03:00:00.000Z&month=2026-07-01T03:00:00.000Z`).set('Authorization', `Bearer ${tok()}`);
    expect(got.today.toISOString()).toBe(today);
  });

  it('sem params → usa fallback UTC (não quebra)', async () => {
    let got: any;
    const app = createApp({ authService: {} as any, dashboardService: fakeService((b) => { got = b; }) as any });
    const res = await request(app).get('/dashboard').set('Authorization', `Bearer ${tok()}`);
    expect(res.status).toBe(200);
    expect(got.today instanceof Date).toBe(true);
    expect(isNaN(got.today.getTime())).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/dashboard.routes.test.ts`
Expected: FAIL — `404` no `GET /dashboard` (rota não montada).

- [ ] **Step 3: Controller com fallback UTC**

Crie `backend/src/modules/dashboard/dashboard.controller.ts`:

```ts
import type { Request, Response } from 'express';
import type { DashboardService, Boundaries } from './dashboard.service';

// Fronteiras de fallback em UTC (usadas se o cliente não mandar as suas).
export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
export function startOfUtcMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
export function startOfUtcWeek(now: Date): Date {
  const day = startOfUtcDay(now);
  const dow = day.getUTCDay(); // 0=domingo
  return new Date(day.getTime() - dow * 86400_000);
}

// Um param só é aceito se for uma data válida; senão, cai no fallback.
function parseBoundary(raw: unknown, fallback: Date): Date {
  if (typeof raw !== 'string') return fallback;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? fallback : d;
}

export function createDashboardController(service: DashboardService) {
  return {
    async get(req: Request, res: Response) {
      const now = new Date();
      const b: Boundaries = {
        today: parseBoundary(req.query.today, startOfUtcDay(now)),
        week: parseBoundary(req.query.week, startOfUtcWeek(now)),
        month: parseBoundary(req.query.month, startOfUtcMonth(now)),
      };
      res.json(await service.getStats(b));
    },
  };
}
```

- [ ] **Step 4: Router**

Crie `backend/src/modules/dashboard/dashboard.router.ts`:

```ts
import { Router } from 'express';
import { requireAuth } from '../../common/security/guards';
import { createDashboardController } from './dashboard.controller';
import type { DashboardService } from './dashboard.service';

const wrap = (fn: (req: any, res: any) => Promise<unknown> | unknown) =>
  (req: any, res: any, next: any) => Promise.resolve(fn(req, res)).catch(next);

export function createDashboardRouter(service: DashboardService): Router {
  const c = createDashboardController(service);
  const r = Router();
  r.get('/dashboard', requireAuth, wrap(c.get));
  return r;
}
```

- [ ] **Step 5: Montar no app**

Em `backend/src/app.ts`:

```ts
import { createDashboardRouter } from './modules/dashboard/dashboard.router';
import type { DashboardService } from './modules/dashboard/dashboard.service';
```
adicione `dashboardService?: DashboardService;` ao objeto `deps` e monte o router (junto dos outros `if (deps.x)`):

```ts
  if (deps.dashboardService) app.use('/', createDashboardRouter(deps.dashboardService));
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/dashboard.routes.test.ts && npm run typecheck > /dev/null 2>&1; echo "EXIT=$?"`
Expected: 4 testes PASS e `EXIT=0`.

- [ ] **Step 7: Wiring real no server**

Em `backend/src/server.ts`:

```ts
import { createDashboardService } from './modules/dashboard/dashboard.service';
```
monte o service (depois do `db` já existir, junto dos outros services) e passe ao `createApp`:

```ts
const dashboardService = createDashboardService({ db });
```
e adicione `dashboardService` ao objeto passado em `createApp({ ... })`.

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/dashboard backend/src/app.ts backend/src/server.ts backend/tests/dashboard.routes.test.ts
git commit -m "feat(dashboard): endpoint GET /dashboard com fronteiras do cliente"
```

---

### Task 3: Tela Flutter

**Files:**
- Create: `app/lib/features/dashboard/dashboard_screen.dart`
- Modify: `app/lib/core/router/app_router.dart`
- Modify: `app/lib/features/home/home_screen.dart`

**Interfaces:**
- Consumes: `GET /dashboard` (Task 2), `apiClientProvider` (`core/auth/auth_providers.dart:25`).
- Produces: rota `/dashboard`.

> Sem widget test (o projeto não testa telas). Verificação: `flutter analyze` + smoke manual.

- [ ] **Step 1: Criar a tela**

Crie `app/lib/features/dashboard/dashboard_screen.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/auth/auth_providers.dart';

class DashboardScreen extends ConsumerStatefulWidget {
  const DashboardScreen({super.key});
  @override
  ConsumerState<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends ConsumerState<DashboardScreen> {
  late Future<Map<String, dynamic>> _stats;

  @override
  void initState() {
    super.initState();
    _stats = _load();
  }

  Future<Map<String, dynamic>> _load() async {
    // Fronteiras calculadas no fuso LOCAL do dispositivo, enviadas como UTC.
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final month = DateTime(now.year, now.month, 1);
    final week = today.subtract(Duration(days: today.weekday % 7)); // início no domingo, locale-agnóstico simples
    final res = await ref.read(apiClientProvider).dio.get('/dashboard', queryParameters: {
      'today': today.toUtc().toIso8601String(),
      'week': week.toUtc().toIso8601String(),
      'month': month.toUtc().toIso8601String(),
    });
    return (res.data as Map).cast<String, dynamic>();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Dashboard')),
      body: FutureBuilder<Map<String, dynamic>>(
        future: _stats,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
          if (snap.hasError) return Center(child: Text('Erro ao carregar: ${snap.error}'));
          final d = snap.data!;
          final raids = (d['raids'] as Map).cast<String, dynamic>();
          final ops = (d['topOperations'] as List).cast<dynamic>();
          final players = (d['topPlayers'] as List).cast<dynamic>();
          return RefreshIndicator(
            onRefresh: () async { setState(() { _stats = _load(); }); await _stats; },
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Wrap(spacing: 12, runSpacing: 12, children: [
                  _statCard(context, 'Hoje', raids['today']),
                  _statCard(context, 'Semana', raids['week']),
                  _statCard(context, 'Mês', raids['month']),
                  _statCard(context, 'Participantes (mês)', d['participantsThisMonth']),
                ]),
                const SizedBox(height: 24),
                Text('Operations mais jogadas', style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 8),
                if (ops.isEmpty) const Text('Sem dados ainda.'),
                ...ops.map((o) => ListTile(
                  dense: true,
                  leading: const Icon(Icons.public),
                  title: Text(o['operation'] as String),
                  trailing: Text('${o['count']}'),
                )),
                const SizedBox(height: 16),
                Text('Jogadores mais ativos', style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 8),
                if (players.isEmpty) const Text('Sem dados ainda.'),
                ...players.map((p) => ListTile(
                  dense: true,
                  leading: CircleAvatar(child: Text(((p['username'] as String?) ?? '?').substring(0, 1).toUpperCase())),
                  title: Text(p['username'] as String? ?? '—'),
                  trailing: Text('${p['raids']} raids'),
                )),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _statCard(BuildContext context, String label, Object? value) => Container(
    width: 150,
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(color: Theme.of(context).colorScheme.surfaceContainerHighest, borderRadius: BorderRadius.circular(12)),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text('${value ?? 0}', style: Theme.of(context).textTheme.headlineMedium),
      Text(label, style: Theme.of(context).textTheme.bodySmall),
    ]),
  );
}
```

- [ ] **Step 2: Registrar a rota**

Em `app/lib/core/router/app_router.dart`, adicione o import e a rota (junto das outras):

```dart
import '../../features/dashboard/dashboard_screen.dart';
```
```dart
      GoRoute(path: '/dashboard', builder: (_, _) => const DashboardScreen()),
```

- [ ] **Step 3: Botão na home**

Em `app/lib/features/home/home_screen.dart`, adicione um botão (logo depois do botão "Raids"):

```dart
                const SizedBox(height: 12),
                FilledButton.icon(
                  onPressed: () => context.push('/dashboard'),
                  icon: const Icon(Icons.bar_chart),
                  label: const Text('Dashboard'),
                ),
```

- [ ] **Step 4: Verificar**

Run: `cd app && flutter analyze`
Expected: `No issues found!`

- [ ] **Step 5: Commit**

```bash
git add app/lib/features/dashboard/dashboard_screen.dart app/lib/core/router/app_router.dart app/lib/features/home/home_screen.dart
git commit -m "feat(app): tela de Dashboard com fronteiras de tempo locais"
```

---

### Task 4: Verificação final

**Files:** nenhum (verificação).

- [ ] **Step 1: Suíte completa + typecheck + build**

Run: `cd backend && npm test`
Expected: **todos passam**. Antes eram 202; o plano acrescenta **6** (2 service + 4 rota) → espere **208 passed, 0 failed**.

Run: `cd backend && npm run typecheck > /dev/null 2>&1; echo "typecheck EXIT=$?"; npm run build > /dev/null 2>&1; echo "build EXIT=$?"`
Expected: ambos `EXIT=0`.

- [ ] **Step 2: Smoke real do endpoint contra o MySQL**

Prova a faixa de tempo e o ranking com dados reais, e que a fronteira do cliente **muda** a contagem:

```bash
cd backend && cat > smoke.tmp.ts <<'EOF'
import 'dotenv/config';
import { db } from './src/db/db';
import { createUserRepo } from './src/db/repositories/userRepo';
import { createRaidRepo } from './src/db/repositories/raidRepo';
import { createDashboardService } from './src/modules/dashboard/dashboard.service';

(async () => {
  const userRepo = createUserRepo(db);
  const raidRepo = createRaidRepo(db);
  const svc = createDashboardService({ db });

  const u = await userRepo.upsertByDiscordId({ discord_id: 'SMK7', username: 'SMK7_u', nickname: null, avatar: null, email: null, role: 'user' });
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const rHoje = await raidRepo.create({ codigo: 'SMK7A', operation: 'SMK7_Op', difficulty: 'HM', size: 8, faction: 'Republic', minimum_tier: 0, check_composition: false, slots_tank: 2, slots_heal: 2, slots_dps: 4, notes: null, start_at: new Date(todayStart.getTime() + 3600_000), created_by: u.id } as any);

  const comHoje = await svc.getStats({ today: todayStart, week: todayStart, month: todayStart });
  const opsMark = comHoje.topOperations.find((o) => o.operation === 'SMK7_Op');
  console.log('--> op SMK7_Op no ranking:', opsMark?.count, '(esperado >=1)');
  console.log('--> raids hoje (>=1):', comHoje.raids.today >= 1);

  // fronteira no futuro → a nossa raid de hoje sai da faixa "today"
  const amanha = new Date(todayStart.getTime() + 86400_000);
  const comAmanha = await svc.getStats({ today: amanha, week: todayStart, month: todayStart });
  console.log('--> today(hoje) > today(amanha):', comHoje.raids.today > comAmanha.raids.today, '(esperado true — a fronteira do cliente muda a contagem)');

  const ok = (opsMark?.count ?? 0) >= 1 && comHoje.raids.today >= 1 && comHoje.raids.today > comAmanha.raids.today;

  await raidRepo.delete(rHoje.id);
  await db.deleteFrom('usuarios').where('id', '=', u.id).execute();
  console.log(ok ? '\n=== SMOKE OK ===' : '\n=== SMOKE FALHOU ===');
  await db.destroy();
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.log('FALHOU:', e.code || '', e.sqlMessage || e.message); process.exit(1); });
EOF
npx tsx smoke.tmp.ts; rm -f smoke.tmp.ts
```
Expected: op no ranking ≥ 1, raids hoje ≥ 1, e `today(hoje) > today(amanhã)` — provando que a fronteira enviada pelo cliente muda a contagem. `=== SMOKE OK ===`.

- [ ] **Step 3: Commit (se algum ajuste foi necessário)**

```bash
git add -A
git commit -m "test(dashboard): verificacao do #7 (regressao + smoke)"
```

---

## Notas de execução

- **Branch:** execute em `feat/dashboard` e faça merge `--no-ff` na `master` ao final (skill `finishing-a-development-branch`).
- **Ordem:** 1 → 2 → 3 → 4. A Task 3 (Flutter) depende do endpoint da Task 2.
- **Testes do dashboard tocam o MySQL real** (agregação SQL não se prova com fake). Precisam do banco no ar; limpam o que criam por `MARK`/cleanup. Se o MySQL estiver fora, sobem-no antes.
- **Cuidado com o `cd`** e **não use pipe no typecheck** (engole o exit code).
